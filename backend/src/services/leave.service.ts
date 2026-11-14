import { eachDay, workingDaysBetween } from '../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { Actor } from '../middleware/auth';
import { assertCanReview, isAdmin, requireEmployee } from './access';
import { audit } from './audit';
import { employeeContext, isWorkingDay } from './attendance.service';
import { ensureBalances } from './leave-balance';
import { notifyEmployee } from './notify';

const yearOf = (d: string) => Number(d.slice(0, 4));

export async function requestLeave(actor: Actor, d: { leaveTypeId: string; startDate: string; endDate: string; reason?: string; documentId?: string }) {
  const employeeId = requireEmployee(actor);
  const type = await prisma.leaveType.findUnique({ where: { id: d.leaveTypeId } });
  if (!type) throw badRequest('Unknown leave type');
  const ctx = await employeeContext(employeeId);
  const days = workingDaysBetween(d.startDate, d.endDate, ctx.schedule.workDays, ctx.holidays);
  if (days === 0) throw badRequest('The selected dates contain no working days');
  if (type.requiresDocument && !d.documentId) throw badRequest(`${type.name} requires a supporting document`);
  if (d.documentId) {
    const f = await prisma.fileUpload.findUnique({ where: { id: d.documentId } });
    if (!f || f.ownerId !== employeeId || f.kind !== 'leave_document') throw badRequest('Invalid supporting document');
  }

  return prisma.$transaction(async (tx) => {
    const clash = await tx.leaveRequest.findFirst({ where: { employeeId, status: { in: ['pending', 'approved'] }, startDate: { lte: d.endDate }, endDate: { gte: d.startDate } } });
    if (clash) throw conflict('You already have leave covering part of this period');
    if (type.tracksBalance) {
      const year = yearOf(d.startDate);
      await ensureBalances(year, employeeId, tx);
      const bal = await tx.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } } });
      const pending = await tx.leaveRequest.aggregate({ _sum: { workingDays: true }, where: { employeeId, leaveTypeId: type.id, status: 'pending', startDate: { startsWith: String(year) } } });
      const remaining = bal.entitled - bal.used - (pending._sum.workingDays ?? 0);
      if (days > remaining) throw badRequest(`Insufficient ${type.name} balance: ${remaining} day(s) remaining`);
    }
    const r = await tx.leaveRequest.create({ data: { employeeId, leaveTypeId: type.id, startDate: d.startDate, endDate: d.endDate, workingDays: days, reason: d.reason, documentId: d.documentId } });
    const emp = ctx.emp;
    if (emp.managerId) await notifyEmployee(emp.managerId, 'Leave request', `${emp.fullName} requested ${days} day(s) of ${type.name}`, 'leave', tx);
    else { const admins = await tx.user.findFirst({ where: { role: 'ADMIN', isActive: true } }); if (admins) await tx.notification.create({ data: { userId: admins.id, title: 'Leave request', body: `${emp.fullName} requested ${days} day(s) of ${type.name}`, kind: 'leave' } }); }
    return r;
  });
}

export async function reviewLeave(actor: Actor, id: string, approve: boolean, note?: string) {
  const req = await prisma.leaveRequest.findUnique({ where: { id }, include: { leaveType: true } });
  if (!req) throw notFound('Leave request not found');
  await assertCanReview(actor, req.employeeId);
  return prisma.$transaction(async (tx) => {
    // Atomic state transition guards against two reviewers (or a double click) both applying the request.
    const moved = await tx.leaveRequest.updateMany({ where: { id, status: 'pending' }, data: { status: approve ? 'approved' : 'rejected', reviewedById: actor.employeeId, reviewedAt: new Date(), reviewNote: note } });
    if (moved.count === 0) throw conflict('Request has already been reviewed');
    if (approve) {
      if (req.leaveType.tracksBalance) {
        const year = yearOf(req.startDate);
        // Conditional UPDATE: the balance check and the increment are one atomic statement (no lost updates).
        const n = await tx.$executeRaw`UPDATE "LeaveBalance" SET used = used + ${req.workingDays}
          WHERE "employeeId" = ${req.employeeId} AND "leaveTypeId" = ${req.leaveTypeId} AND year = ${year} AND entitled - used >= ${req.workingDays}`;
        if (n === 0) throw badRequest('Insufficient leave balance');
      }
      const ctx = await employeeContext(req.employeeId, tx);
      for (const day of eachDay(req.startDate, req.endDate)) {
        if (!isWorkingDay(ctx, day)) continue; // weekends & holidays are never touched or double-counted
        const rec = await tx.attendance.findUnique({ where: { employeeId_workDate: { employeeId: req.employeeId, workDate: day } } });
        if (!rec) await tx.attendance.create({ data: { employeeId: req.employeeId, workDate: day, status: 'on_leave', scheduledMinutes: 0 } });
        else if (!rec.clockIn) await tx.attendance.update({ where: { id: rec.id }, data: { status: 'on_leave', scheduledMinutes: 0 } });
      }
    }
    await audit({ actorId: actor.userId, action: approve ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', entity: 'LeaveRequest', entityId: id, after: { days: req.workingDays, note } }, tx);
    await notifyEmployee(req.employeeId, `Leave ${approve ? 'approved' : 'rejected'}`, `${req.leaveType.name} ${req.startDate} → ${req.endDate} was ${approve ? 'approved' : 'rejected'}`, 'leave', tx);
    return tx.leaveRequest.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelLeave(actor: Actor, id: string, todayStr: string) {
  const req = await prisma.leaveRequest.findUnique({ where: { id }, include: { leaveType: true } });
  if (!req) throw notFound('Leave request not found');
  if (req.employeeId !== actor.employeeId && !isAdmin(actor)) throw forbidden();
  if (!['pending', 'approved'].includes(req.status)) throw badRequest(`Request is already ${req.status}`);
  if (req.status === 'approved' && req.startDate < todayStr) throw badRequest('Leave that has already started cannot be cancelled');
  return prisma.$transaction(async (tx) => {
    const moved = await tx.leaveRequest.updateMany({ where: { id, status: req.status }, data: { status: 'cancelled' } });
    if (moved.count === 0) throw conflict('Request changed, please retry');
    if (req.status === 'approved') {
      if (req.leaveType.tracksBalance) await tx.leaveBalance.updateMany({ where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: yearOf(req.startDate) }, data: { used: { decrement: req.workingDays } } });
      await tx.attendance.deleteMany({ where: { employeeId: req.employeeId, status: 'on_leave', clockIn: null, workDate: { gte: req.startDate, lte: req.endDate } } });
    }
    await audit({ actorId: actor.userId, action: 'LEAVE_CANCELLED', entity: 'LeaveRequest', entityId: id }, tx);
    return tx.leaveRequest.findUniqueOrThrow({ where: { id } });
  });
}
