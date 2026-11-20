import { addDays, startOfWeek, todayIn } from '../lib/dates';
import type { Request } from 'express';
import { ah, conflict, forbidden, notFound } from '../lib/errors';
import { cleanIp } from '../lib/workplace';
import { audit } from '../services/audit';
import { notifyEmployee } from '../services/notify';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import { assertCanViewEmployee, idFilter, isAdmin, isLead, visibleEmployeeIds } from '../services/access';
import * as svc from '../services/attendance.service';
import { clockInBody, closeDayBody, correctionBody, decisionBody, eventBody, eventsQuery, rangeQuery, verificationDecisionBody, weeklyQuery } from '../validators/attendance';

const origin = (req: Request, deviceId?: string): svc.Origin => ({ ip: cleanIp(req.ip), deviceId });
export const clockIn = ah(async (req, res) => { const b = body(req, clockInBody); res.status(201).json(await svc.clockIn(actorOf(req), b.location, origin(req, b.deviceId))); });
export const startBreak = ah(async (req, res) => res.json(await svc.startBreak(actorOf(req), origin(req, body(req, eventBody).deviceId))));
export const endBreak = ah(async (req, res) => res.json(await svc.endBreak(actorOf(req), origin(req, body(req, eventBody).deviceId))));
export const clockOut = ah(async (req, res) => res.json(await svc.clockOut(actorOf(req), origin(req, body(req, eventBody).deviceId))));
export const check = ah(async (req, res) => res.json(await svc.sessionCheck(actorOf(req), origin(req, body(req, eventBody).deviceId))));

/** Auditable working-time events for one day. Same visibility rule as the rest of attendance. */
export const events = ah(async (req, res) => {
  const a = actorOf(req);
  const q = query(req, eventsQuery);
  const employeeId = q.employeeId ?? a.employeeId;
  if (!employeeId) return res.json([]);
  await assertCanViewEmployee(a, employeeId);
  const att = await prisma.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate: q.date } }, select: { id: true } });
  res.json(att ? await prisma.attendanceEvent.findMany({ where: { attendanceId: att.id }, orderBy: { at: 'asc' } }) : []);
});

/** HR resolves a Needs Review day. */
export const reviewVerification = ah(async (req, res) => {
  const { decision } = body(req, verificationDecisionBody);
  const id = String(req.params.id);
  const rec = await prisma.attendance.findUnique({ where: { id } });
  if (!rec) throw notFound('Record not found');
  if (rec.verification !== 'needs_review') throw conflict('This record is not awaiting verification review');
  const verification = decision === 'approve' ? 'hr_approved' : 'hr_rejected';
  const a = actorOf(req);
  const [updated] = await prisma.$transaction([
    prisma.attendance.update({ where: { id }, data: { verification } }),
    prisma.attendanceEvent.create({ data: { attendanceId: id, employeeId: rec.employeeId, type: 'hr_review', verification, note: `Reviewed by ${a.email}` } }),
  ]);
  await audit({ actorId: a.userId, action: `ATTENDANCE_VERIFICATION_${decision === 'approve' ? 'APPROVED' : 'REJECTED'}`, entity: 'Attendance', entityId: id });
  await notifyEmployee(rec.employeeId, `Workplace check ${decision === 'approve' ? 'approved' : 'rejected'}`, `HR reviewed your attendance for ${rec.workDate}`, 'attendance');
  res.json(updated);
});
export const today = ah(async (req, res) => res.json(await svc.today(actorOf(req))));

async function defaults(q: { from?: string; to?: string }) {
  const cfg = await svc.settings();
  const t = todayIn(cfg.timezone);
  return { from: q.from ?? addDays(t, -60), to: q.to ?? t };
}

export const mine = ah(async (req, res) => {
  const a = actorOf(req);
  const { from, to } = await defaults(query(req, rangeQuery));
  if (!a.employeeId) return res.json([]);
  res.json(await prisma.attendance.findMany({ where: { employeeId: a.employeeId, workDate: { gte: from, lte: to } }, orderBy: { workDate: 'desc' } }));
});

/** Team = everyone for HR, direct reports for managers. Staff are refused. */
export const team = ah(async (req, res) => {
  const a = actorOf(req);
  if (!isLead(a)) throw forbidden();
  const q = query(req, rangeQuery);
  const { from, to } = await defaults(q);
  let ids = await visibleEmployeeIds(a);
  if (!isAdmin(a)) ids = (ids ?? []).filter((i) => i !== a.employeeId);
  if (q.employeeId) { await assertCanViewEmployee(a, q.employeeId); ids = [q.employeeId]; }
  const rows = await prisma.attendance.findMany({ where: { workDate: { gte: from, lte: to }, employeeId: idFilter(ids) }, include: { employee: { select: { fullName: true, departmentId: true } } }, orderBy: [{ workDate: 'desc' }], take: 10000 });
  res.json(rows);
});

export const weekly = ah(async (req, res) => {
  const a = actorOf(req);
  const q = query(req, weeklyQuery);
  const cfg = await svc.settings();
  const weekStart = startOfWeek(q.weekStart ?? todayIn(cfg.timezone));
  const team = q.scope === 'team';
  if (team && !isLead(a)) throw forbidden();
  let ids: string[] | null = team ? await visibleEmployeeIds(a) : a.employeeId ? [a.employeeId] : [];
  if (team && !isAdmin(a)) ids = (ids ?? []).filter((i) => i !== a.employeeId);
  const rows = await prisma.attendance.findMany({ where: { workDate: { gte: weekStart, lte: addDays(weekStart, 6) }, employeeId: idFilter(ids) } });
  const sched = a.employeeId ? (await svc.employeeContext(a.employeeId)) : { schedule: { workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }, holidays: new Set<string>() };
  res.json({ ...svc.weekSummary(weekStart, rows, sched.schedule, sched.holidays, team ? ids?.length ?? 2 : 1), schedule: sched.schedule, scope: q.scope });
});

export const requestCorrection = ah(async (req, res) => {
  const d = body(req, correctionBody);
  res.status(201).json(await svc.requestCorrection(actorOf(req), d));
});

export const corrections = ah(async (req, res) => {
  const a = actorOf(req);
  const ids = await visibleEmployeeIds(a);
  res.json(await prisma.attendanceCorrection.findMany({ where: { employeeId: idFilter(ids) }, include: { employee: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }));
});

export const reviewCorrection = ah(async (req, res) => {
  res.json(await svc.reviewCorrection(actorOf(req), String(req.params.id), req.params.decision === 'approve'));
});

export const reviewOvertime = ah(async (req, res) => res.json(await svc.reviewOvertime(actorOf(req), String(req.params.id), body(req, decisionBody).approve)));

export const closeDay = ah(async (req, res) => {
  const cfg = await svc.settings();
  const { date } = body(req, closeDayBody);
  const d = date ?? addDays(todayIn(cfg.timezone), -1);
  res.json({ date: d, recorded: await svc.closeDay(d) });
});
