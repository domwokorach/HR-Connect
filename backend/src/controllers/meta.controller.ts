import { z } from 'zod';
import { ah, badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import { audit } from '../services/audit';
import { ensureBalances } from '../services/leave-balance';
import { hhmm, isoDate } from '../validators/common';

const tzValid = (s: string) => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } };

export const departments = ah(async (_q, res) => res.json(await prisma.department.findMany({ orderBy: { name: 'asc' } })));
export const createDepartment = ah(async (req, res) => {
  const { name } = body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  res.status(201).json(await prisma.department.create({ data: { name } }));
});

export const schedules = ah(async (_q, res) => res.json(await prisma.workSchedule.findMany({ orderBy: { createdAt: 'asc' } })));
export const updateSchedule = ah(async (req, res) => {
  const a = actorOf(req);
  const d = body(req, z.object({
    name: z.string().trim().min(1).max(80).optional(), workDays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
    startTime: hhmm.optional(), endTime: hhmm.optional(), unpaidBreakMinutes: z.number().int().min(0).max(240).optional(),
  }));
  const before = await prisma.workSchedule.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound();
  if ((d.endTime ?? before.endTime) <= (d.startTime ?? before.startTime)) throw badRequest('Finish time must be after start time');
  const after = await prisma.workSchedule.update({ where: { id: before.id }, data: { ...d, ...(d.workDays && { workDays: [...new Set(d.workDays)].sort() }) } });
  await audit({ actorId: a.userId, action: 'SCHEDULE_UPDATED', entity: 'WorkSchedule', entityId: before.id, before, after });
  res.json(after);
});

export const holidays = ah(async (_q, res) => res.json(await prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } })));
export const createHoliday = ah(async (req, res) => {
  const d = body(req, z.object({ holidayDate: isoDate, name: z.string().trim().min(1).max(100), country: z.string().length(2).default('GB') }));
  res.status(201).json(await prisma.holiday.create({ data: d }));
});
export const deleteHoliday = ah(async (req, res) => { await prisma.holiday.delete({ where: { id: String(req.params.id) } }); res.json({ ok: true }); });

export const leaveTypes = ah(async (_q, res) => res.json(await prisma.leaveType.findMany({ orderBy: { name: 'asc' } })));
export const createLeaveType = ah(async (req, res) => {
  const d = body(req, z.object({ name: z.string().trim().min(1).max(60), isPaid: z.boolean().default(true), defaultDays: z.number().min(0).max(365).default(0), requiresDocument: z.boolean().default(false), tracksBalance: z.boolean().default(true), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3B82F6') }));
  const t = await prisma.leaveType.create({ data: d });
  await ensureBalances(new Date().getUTCFullYear());
  res.status(201).json(t);
});

export const getSettings = ah(async (_q, res) => res.json(await prisma.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} })));
export const updateSettings = ah(async (req, res) => {
  const a = actorOf(req);
  const d = body(req, z.object({
    companyName: z.string().trim().min(1).max(100), timezone: z.string().refine(tzValid, 'Not a valid IANA time zone'),
    country: z.string().length(2), lateGraceMinutes: z.number().int().min(0).max(120), overtimeMultiplier: z.number().min(1).max(5), retentionMonths: z.number().int().min(6).max(240),
  }).partial());
  const before = await prisma.companySettings.findUnique({ where: { id: 1 } });
  const after = await prisma.companySettings.upsert({ where: { id: 1 }, update: d, create: d });
  await audit({ actorId: a.userId, action: 'SETTINGS_UPDATED', entity: 'CompanySettings', entityId: '1', before, after });
  res.json(after);
});

/** Data-retention control: removes audit logs / read notifications / stale rejected candidates older than the configured window. */
export const purge = ah(async (req, res) => {
  const a = actorOf(req);
  const s = await prisma.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} });
  const cutoff = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d; };
  const [al, nt, cd] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff(s.retentionMonths) } } }),
    prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff(Math.min(s.retentionMonths, 12)) } } }),
    prisma.candidate.deleteMany({ where: { createdAt: { lt: cutoff(s.retentionMonths) }, applications: { none: { status: { in: ['offered', 'hired', 'interview'] } } } } }),
  ]);
  await audit({ actorId: a.userId, action: 'RETENTION_PURGE', entity: 'System', after: { auditLogs: al.count, notifications: nt.count, candidates: cd.count } });
  res.json({ auditLogs: al.count, notifications: nt.count, candidates: cd.count });
});

export const auditLogs = ah(async (req, res) => {
  const { limit, entity } = query(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), entity: z.string().optional() }));
  res.json(await prisma.auditLog.findMany({ where: entity ? { entity: { startsWith: entity } } : {}, orderBy: { createdAt: 'desc' }, take: limit }));
});

/** GDPR-style subject access: everything held about the signed-in employee. */
export const exportMine = ah(async (req, res) => {
  const a = actorOf(req);
  if (!a.employeeId) return res.json({});
  const id = a.employeeId;
  const [employee, attendance, leave, payslips, trainings, benefits] = await Promise.all([
    prisma.employee.findUnique({ where: { id } }), prisma.attendance.findMany({ where: { employeeId: id } }), prisma.leaveRequest.findMany({ where: { employeeId: id } }),
    prisma.payslip.findMany({ where: { employeeId: id } }), prisma.employeeTraining.findMany({ where: { employeeId: id } }), prisma.employeeBenefit.findMany({ where: { employeeId: id } }),
  ]);
  res.json({ exportedAt: new Date().toISOString(), employee, attendance, leave, payslips, trainings, benefits });
});
