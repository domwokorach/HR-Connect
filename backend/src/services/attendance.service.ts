import type { Attendance, AttendanceBreak, Prisma, WorkLocation } from '@prisma/client';
import { computeAttendance } from '../lib/attendance-calc';
import { addDays, isoWeekday, todayIn, zonedInstant } from '../lib/dates';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import type { Actor } from '../middleware/auth';
import { assertCanReview, requireEmployee } from './access';
import { audit } from './audit';
import { notifyEmployee } from './notify';

export async function settings() {
  return prisma.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} });
}

const FALLBACK = { workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', unpaidBreakMinutes: 0 };

/** Everything needed to evaluate one employee's working day. */
export async function employeeContext(employeeId: string, tx: Tx | typeof prisma = prisma) {
  const emp = await tx.employee.findUnique({ where: { id: employeeId }, include: { schedule: true } });
  if (!emp) throw notFound('Employee not found');
  const schedule = emp.schedule ?? (await tx.workSchedule.findFirst({ orderBy: { createdAt: 'asc' } })) ?? FALLBACK;
  const hols = await tx.holiday.findMany({ where: { country: emp.country }, select: { holidayDate: true } });
  return { emp, schedule, holidays: new Set(hols.map((h) => h.holidayDate)) };
}
type Ctx = Awaited<ReturnType<typeof employeeContext>>;
export const isWorkingDay = (c: Ctx, date: string) => c.schedule.workDays.includes(isoWeekday(date)) && !c.holidays.has(date);

export async function recompute(tx: Tx, attendanceId: string, ctx?: Ctx): Promise<Attendance> {
  const rec = await tx.attendance.findUniqueOrThrow({ where: { id: attendanceId }, include: { breaks: true } });
  const cfg = await tx.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} });
  const c = ctx ?? (await employeeContext(rec.employeeId, tx));
  const r = computeAttendance({
    workDate: rec.workDate, tz: cfg.timezone, clockIn: rec.clockIn, clockOut: rec.clockOut, breaks: rec.breaks,
    isWorkingDay: isWorkingDay(c, rec.workDate), schedule: c.schedule, graceMinutes: cfg.lateGraceMinutes, location: rec.workLocation,
  });
  const { status, ...rest } = r;
  return tx.attendance.update({
    where: { id: attendanceId },
    data: { ...rest, overtimeStatus: r.overtimeMinutes > 0 ? 'pending' : 'none', ...(status && { status }) },
  });
}

async function openRecord(employeeId: string) {
  const rec = await prisma.attendance.findFirst({ where: { employeeId, clockIn: { not: null }, clockOut: null }, orderBy: { workDate: 'desc' }, include: { breaks: true } });
  if (!rec) throw badRequest('You are not clocked in');
  return rec;
}

export async function clockIn(actor: Actor, location: WorkLocation) {
  const employeeId = requireEmployee(actor);
  const cfg = await settings();
  const date = todayIn(cfg.timezone);
  try {
    return await prisma.$transaction(async (tx) => {
      const ctx = await employeeContext(employeeId, tx);
      if (ctx.emp.status === 'inactive') throw new HttpError(403, 'Inactive employees cannot clock in');
      const existing = await tx.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate: date } } });
      if (existing?.clockIn) throw conflict('Already clocked in today');
      if (existing?.status === 'on_leave') throw conflict('You are on approved leave today');
      const rec = existing
        ? await tx.attendance.update({ where: { id: existing.id }, data: { clockIn: new Date(), workLocation: location, status: 'present' } })
        : await tx.attendance.create({ data: { employeeId, workDate: date, clockIn: new Date(), workLocation: location } });
      return recompute(tx, rec.id, ctx);
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw conflict('Already clocked in today'); // concurrent double-tap
    throw e;
  }
}

export async function startBreak(actor: Actor) {
  const rec = await openRecord(requireEmployee(actor));
  if (rec.breaks.some((b) => !b.endedAt)) throw conflict('A break is already in progress');
  await prisma.attendanceBreak.create({ data: { attendanceId: rec.id } });
  return rec;
}

export async function endBreak(actor: Actor) {
  const rec = await openRecord(requireEmployee(actor));
  const open = rec.breaks.find((b) => !b.endedAt);
  if (!open) throw badRequest('No break in progress');
  await prisma.attendanceBreak.update({ where: { id: open.id }, data: { endedAt: new Date() } });
  return rec;
}

export async function clockOut(actor: Actor) {
  const rec = await openRecord(requireEmployee(actor));
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.attendanceBreak.updateMany({ where: { attendanceId: rec.id, endedAt: null }, data: { endedAt: now } });
    await tx.attendance.update({ where: { id: rec.id }, data: { clockOut: now } });
    return recompute(tx, rec.id);
  });
}

export async function today(actor: Actor) {
  const employeeId = requireEmployee(actor);
  const cfg = await settings();
  const date = todayIn(cfg.timezone);
  const [record, ctx] = await Promise.all([
    prisma.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate: date } }, include: { breaks: true } }),
    employeeContext(employeeId),
  ]);
  return { date, timezone: cfg.timezone, record, schedule: ctx.schedule, isWorkingDay: isWorkingDay(ctx, date) };
}

export async function requestCorrection(actor: Actor, d: { workDate: string; clockIn: string; clockOut: string; location: WorkLocation; reason: string }) {
  const employeeId = requireEmployee(actor);
  const cfg = await settings();
  if (d.workDate > todayIn(cfg.timezone)) throw badRequest('Cannot correct a future date');
  const c = await prisma.attendanceCorrection.create({
    data: { employeeId, workDate: d.workDate, requestedClockIn: zonedInstant(d.workDate, d.clockIn, cfg.timezone), requestedClockOut: zonedInstant(d.workDate, d.clockOut, cfg.timezone), workLocation: d.location, reason: d.reason },
  });
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  await notifyEmployee(emp?.managerId, 'Attendance correction requested', `${emp?.fullName} asked to correct ${d.workDate}`, 'attendance');
  return c;
}

export async function reviewCorrection(actor: Actor, id: string, approve: boolean) {
  const c = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!c) throw notFound('Correction not found');
  await assertCanReview(actor, c.employeeId);
  return prisma.$transaction(async (tx) => {
    // updateMany with status guard makes the decision atomic: a second reviewer gets count 0.
    const done = await tx.attendanceCorrection.updateMany({ where: { id, status: 'pending' }, data: { status: approve ? 'approved' : 'rejected', reviewedById: actor.employeeId, reviewedAt: new Date() } });
    if (done.count === 0) throw conflict('Correction already reviewed');
    if (approve) {
      const ctx = await employeeContext(c.employeeId, tx);
      const rec = await tx.attendance.upsert({
        where: { employeeId_workDate: { employeeId: c.employeeId, workDate: c.workDate } },
        update: { clockIn: c.requestedClockIn, clockOut: c.requestedClockOut, workLocation: c.workLocation, notes: `Corrected: ${c.reason}` },
        create: { employeeId: c.employeeId, workDate: c.workDate, clockIn: c.requestedClockIn, clockOut: c.requestedClockOut, workLocation: c.workLocation, notes: `Corrected: ${c.reason}` },
      });
      await recompute(tx, rec.id, ctx);
    }
    await audit({ actorId: actor.userId, action: approve ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED', entity: 'AttendanceCorrection', entityId: id }, tx);
    await notifyEmployee(c.employeeId, `Attendance correction ${approve ? 'approved' : 'rejected'}`, `Your correction for ${c.workDate} was ${approve ? 'approved' : 'rejected'}`, 'attendance', tx);
    return tx.attendanceCorrection.findUniqueOrThrow({ where: { id } });
  });
}

export async function reviewOvertime(actor: Actor, attendanceId: string, approve: boolean) {
  const rec = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!rec) throw notFound('Record not found');
  await assertCanReview(actor, rec.employeeId);
  const done = await prisma.attendance.updateMany({ where: { id: attendanceId, overtimeStatus: 'pending' }, data: { overtimeStatus: approve ? 'approved' : 'rejected' } });
  if (done.count === 0) throw badRequest('No pending overtime on this record');
  await audit({ actorId: actor.userId, action: approve ? 'OVERTIME_APPROVED' : 'OVERTIME_REJECTED', entity: 'Attendance', entityId: attendanceId, after: { minutes: rec.overtimeMinutes } });
  await notifyEmployee(rec.employeeId, `Overtime ${approve ? 'approved' : 'rejected'}`, `${rec.overtimeMinutes} min on ${rec.workDate}`, 'attendance');
  return prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } });
}

/** End-of-day job: records absences and public holidays for everyone with no record that day. */
export async function closeDay(date: string) {
  const cfg = await settings();
  if (date >= todayIn(cfg.timezone)) throw badRequest('Only past days can be closed');
  const emps = await prisma.employee.findMany({ where: { status: 'active', startDate: { lte: date } }, select: { id: true } });
  const existing = new Set((await prisma.attendance.findMany({ where: { workDate: date }, select: { employeeId: true } })).map((r) => r.employeeId));
  let n = 0;
  for (const e of emps) {
    if (existing.has(e.id)) continue;
    const ctx = await employeeContext(e.id);
    if (ctx.holidays.has(date)) { await prisma.attendance.create({ data: { employeeId: e.id, workDate: date, status: 'public_holiday', scheduledMinutes: 0 } }); n++; }
    else if (isWorkingDay(ctx, date)) { await prisma.attendance.create({ data: { employeeId: e.id, workDate: date, status: 'absent' } }); n++; }
  }
  return n;
}

export type AttendanceRow = Attendance & { breaks?: AttendanceBreak[] };

export function weekSummary(weekStart: string, rows: AttendanceRow[], schedule: { workDays: number[] }, holidays: Set<string>, headcount: number) {
  const days = [0, 1, 2, 3, 4].map((i) => {
    const date = addDays(weekStart, i);
    const rs = rows.filter((r) => r.workDate === date);
    const clocked = rs.filter((r) => r.clockIn);
    const sched = rs.find((r) => r.scheduledMinutes)?.scheduledMinutes ?? 480;
    return {
      date, weekday: i + 1, isWorkingDay: schedule.workDays.includes(i + 1) && !holidays.has(date), isHoliday: holidays.has(date),
      scheduledMinutes: sched,
      workedMinutes: clocked.length ? Math.round(clocked.reduce((s, r) => s + r.workedMinutes, 0) / (headcount > 1 ? clocked.length : 1)) : 0,
      totalWorkedMinutes: clocked.reduce((s, r) => s + r.workedMinutes, 0),
      lateCount: rs.filter((r) => r.lateMinutes > 0).length, lateMinutes: rs.reduce((s, r) => s + r.lateMinutes, 0),
      office: clocked.filter((r) => r.workLocation === 'office').length, remote: clocked.filter((r) => r.workLocation === 'remote').length,
      overtimeMinutes: rs.filter((r) => r.overtimeStatus !== 'rejected').reduce((s, r) => s + r.overtimeMinutes, 0),
      absent: rs.filter((r) => r.status === 'absent').length, onLeave: rs.filter((r) => r.status === 'on_leave').length,
      records: rs,
    };
  });
  return { weekStart, days, totals: { workedMinutes: days.reduce((s, d) => s + d.totalWorkedMinutes, 0), overtimeMinutes: days.reduce((s, d) => s + d.overtimeMinutes, 0), lateCount: days.reduce((s, d) => s + d.lateCount, 0) } };
}

export type Where = Prisma.AttendanceWhereInput;
