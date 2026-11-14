import { z } from 'zod';
import { addDays, isoWeekday, startOfWeek, todayIn } from '../lib/dates';
import { ah, forbidden } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { query } from '../middleware/validate';
import { idFilter, isAdmin, isLead, visibleEmployeeIds } from '../services/access';
import { settings } from '../services/attendance.service';
import { dateRange } from '../validators/common';

const rangeQ = dateRange.extend({ departmentId: z.string().uuid().optional(), employeeId: z.string().uuid().optional(), managerId: z.string().uuid().optional() });
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

/** Employee ids matching the filters AND within the caller's authority. */
async function scopedIds(req: Parameters<typeof actorOf>[0], q: z.infer<typeof rangeQ>) {
  const a = actorOf(req);
  if (!isLead(a)) throw forbidden();
  const allowed = await visibleEmployeeIds(a);
  const emps = await prisma.employee.findMany({ where: { id: idFilter(allowed), ...(q.departmentId && { departmentId: q.departmentId }), ...(q.managerId && { managerId: q.managerId }), ...(q.employeeId && { id: q.employeeId }) }, select: { id: true } });
  return emps.map((e) => e.id);
}

export const dashboard = ah(async (req, res) => {
  const a = actorOf(req);
  const cfg = await settings();
  const today = todayIn(cfg.timezone);
  const weekStart = startOfWeek(today);
  const ids = await visibleEmployeeIds(a);
  const people = await prisma.employee.findMany({ where: { id: idFilter(ids), status: { not: 'inactive' } }, select: { id: true, department: { select: { name: true } } } });
  const pids = people.map((p) => p.id);
  const [week, pending, training, payroll, mineWeek, balances] = await Promise.all([
    prisma.attendance.findMany({ where: { workDate: { gte: weekStart, lte: addDays(weekStart, 6) }, employeeId: { in: pids } } }),
    prisma.leaveRequest.count({ where: { status: 'pending', employeeId: idFilter(ids) } }),
    prisma.employeeTraining.findMany({ where: { employeeId: { in: pids } }, select: { status: true, dueDate: true, progress: true } }),
    isAdmin(a) ? prisma.payroll.findFirst({ orderBy: { periodStart: 'desc' }, include: { items: { select: { netPay: true, grossPay: true } } } }) : null,
    a.employeeId ? prisma.attendance.aggregate({ _sum: { workedMinutes: true }, where: { employeeId: a.employeeId, workDate: { gte: weekStart, lte: addDays(weekStart, 6) } } }) : null,
    a.employeeId ? prisma.leaveBalance.findMany({ where: { employeeId: a.employeeId, year: Number(today.slice(0, 4)) } }) : [],
  ]);
  const todays = week.filter((r) => r.workDate === today);
  const clocked = todays.filter((r) => r.clockIn);
  const onLeave = todays.filter((r) => r.status === 'on_leave').length;
  const holiday = todays.some((r) => r.status === 'public_holiday');
  const done = training.filter((t) => t.status === 'completed' || t.progress >= 100).length;
  const deptCounts: Record<string, number> = {};
  for (const p of people) { const n = p.department?.name ?? 'Unassigned'; deptCounts[n] = (deptCounts[n] ?? 0) + 1; }
  // ---- comparisons, trends, recent activity (all restricted to the caller's authority)
  const yesterday = addDays(today, -1);
  const lastWorkdayBefore = (() => { let d = yesterday; while ([6, 7].includes(isoWeekday(d))) d = addDays(d, -1); return d; })();
  const trendFrom = addDays(today, -13);
  const [trendRows, prevDay, trainingRows, payrolls, pendingLeaveRows, pendingOt, pendingCor, recentJoiners, recentClock, recentLeaveDecisions, recentTraining, recentPayrollAudit, myLeave] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId: { in: pids }, workDate: { gte: trendFrom, lte: today }, clockIn: { not: null } }, select: { workDate: true, workLocation: true, status: true, workedMinutes: true } }),
    prisma.attendance.count({ where: { employeeId: { in: pids }, workDate: lastWorkdayBefore, clockIn: { not: null } } }),
    prisma.employeeTraining.groupBy({ by: ['status'], where: { employeeId: { in: pids } }, _count: true }),
    isAdmin(a) ? prisma.payroll.findMany({ orderBy: { periodStart: 'desc' }, take: 6, include: { items: { select: { grossPay: true, netPay: true, bonuses: true, overtimePay: true, deductions: true } } } }) : [],
    isLead(a) ? prisma.leaveRequest.findMany({ where: { status: 'pending', employeeId: { in: pids.filter((i) => i !== a.employeeId) } }, orderBy: { createdAt: 'asc' }, take: 5, include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } } }) : [],
    isLead(a) ? prisma.attendance.count({ where: { employeeId: { in: pids.filter((i) => i !== a.employeeId) }, overtimeStatus: 'pending' } }) : 0,
    isLead(a) ? prisma.attendanceCorrection.count({ where: { employeeId: { in: pids.filter((i) => i !== a.employeeId) }, status: 'pending' } }) : 0,
    isLead(a) ? prisma.employee.findMany({ where: { id: { in: pids }, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, fullName: true, jobTitle: true, createdAt: true } }) : [],
    prisma.attendance.findMany({ where: { employeeId: { in: pids }, workDate: today, clockIn: { not: null } }, orderBy: { clockIn: 'desc' }, take: 4, include: { employee: { select: { fullName: true } } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: pids }, status: { in: ['approved', 'rejected'] }, reviewedAt: { not: null } }, orderBy: { reviewedAt: 'desc' }, take: 3, include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } } }),
    prisma.employeeTraining.findMany({ where: { employeeId: { in: pids }, status: 'completed', completionDate: { not: null } }, orderBy: { completionDate: 'desc' }, take: 3, include: { employee: { select: { fullName: true } }, training: { select: { title: true } } } }),
    isAdmin(a) ? prisma.auditLog.findMany({ where: { entity: 'Payroll' }, orderBy: { createdAt: 'desc' }, take: 2 }) : [],
    a.employeeId ? prisma.leaveRequest.findMany({ where: { employeeId: a.employeeId }, orderBy: { createdAt: 'desc' }, take: 5, include: { leaveType: { select: { name: true } } } }) : [],
  ]);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(trendFrom, i)).filter((d) => ![6, 7].includes(isoWeekday(d)));
  const presentTrend = days14.map((d) => ({ date: d, present: trendRows.filter((r) => r.workDate === d).length, remote: trendRows.filter((r) => r.workDate === d && r.workLocation === 'remote').length, late: trendRows.filter((r) => r.workDate === d && r.status === 'late').length }));
  const trainingCounts = Object.fromEntries(trainingRows.map((t) => [t.status, t._count]));
  const sumItems = (p: (typeof payrolls)[number], f: 'grossPay' | 'netPay' | 'bonuses' | 'overtimePay' | 'deductions') => p.items.reduce((x, i) => x + Number(i[f]), 0);
  const payrollTrend = [...payrolls].reverse().map((p) => ({ period: p.periodStart, status: p.status, gross: sumItems(p, 'grossPay'), net: sumItems(p, 'netPay'), bonuses: sumItems(p, 'bonuses'), overtime: sumItems(p, 'overtimePay'), deductions: sumItems(p, 'deductions') }));
  const activities = [
    ...recentJoiners.map((e) => ({ kind: 'employee', title: `${e.fullName} joined`, detail: e.jobTitle || 'New employee', at: e.createdAt })),
    ...recentClock.map((r) => ({ kind: 'clock', title: `${r.employee.fullName} clocked in`, detail: r.workLocation === 'remote' ? 'Remote' : 'In office', at: r.clockIn! })),
    ...recentLeaveDecisions.map((l) => ({ kind: 'leave', title: `${l.employee.fullName}'s ${l.leaveType.name} ${l.status}`, detail: `${l.startDate} → ${l.endDate}`, at: l.reviewedAt! })),
    ...recentTraining.map((t) => ({ kind: 'training', title: `${t.employee.fullName} completed ${t.training.title}`, detail: t.completionDate ?? '', at: new Date(`${t.completionDate}T12:00:00Z`) })),
    ...recentPayrollAudit.map((l) => ({ kind: 'payroll', title: l.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (m) => m.toUpperCase()), detail: 'Payroll', at: l.createdAt })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 8);
  const prevPayroll = payrollTrend.length > 1 ? payrollTrend[payrollTrend.length - 2] : null;
  const latestPayroll = payrollTrend.length ? payrollTrend[payrollTrend.length - 1] : null;

  res.json({
    today, totalEmployees: people.length, presentToday: clocked.length, presentPrevDay: prevDay, inOffice: clocked.filter((r) => r.workLocation === 'office').length,
    remote: clocked.filter((r) => r.workLocation === 'remote').length, absentToday: holiday ? 0 : Math.max(0, people.length - clocked.length - onLeave),
    pendingLeave: pending, monthlyPayroll: payroll ? { period: payroll.periodStart, net: payroll.items.reduce((s, i) => s + Number(i.netPay), 0), gross: payroll.items.reduce((s, i) => s + Number(i.grossPay), 0), previousNet: prevPayroll?.net ?? null } : null,
    trainingCompletion: pct(done, training.length), trainingAssigned: training.length,
    trainingBreakdown: { completed: trainingCounts.completed ?? 0, in_progress: trainingCounts.in_progress ?? 0, not_started: trainingCounts.not_started ?? 0, overdue: trainingCounts.overdue ?? 0 },
    weekly: [0, 1, 2, 3, 4].map((i) => { const d = addDays(weekStart, i); const rs = week.filter((r) => r.workDate === d); const wk = rs.filter((r) => r.clockIn); return { date: d, office: rs.filter((r) => r.clockIn && r.workLocation === 'office').length, remote: rs.filter((r) => r.clockIn && r.workLocation === 'remote').length, onLeave: rs.filter((r) => r.status === 'on_leave').length, workedHours: wk.length ? Math.round((wk.reduce((s, r) => s + r.workedMinutes, 0) / wk.length / 60) * 10) / 10 : 0, scheduledHours: 8 }; }),
    presentTrend, payrollTrend: isAdmin(a) ? payrollTrend : [], latestPayroll: isAdmin(a) ? latestPayroll : null,
    departments: Object.entries(deptCounts).map(([name, count]) => ({ name, count })),
    pendingApprovals: { leave: pendingLeaveRows.map((l) => ({ id: l.id, employee: l.employee.fullName, type: l.leaveType.name, startDate: l.startDate, endDate: l.endDate, days: l.workingDays })), overtime: pendingOt, corrections: pendingCor },
    recentActivity: activities.map((x) => ({ ...x, at: x.at.toISOString() })), myRequests: myLeave.map((l) => ({ id: l.id, type: l.leaveType.name, startDate: l.startDate, endDate: l.endDate, status: l.status })),
    me: { workedMinutesThisWeek: mineWeek?._sum.workedMinutes ?? 0, leaveRemaining: balances.reduce((s, b) => s + Math.max(0, b.entitled - b.used), 0) },
  });
});

export const attendance = ah(async (req, res) => {
  const q = query(req, rangeQ);
  const t = todayIn((await settings()).timezone);
  const from = q.from ?? addDays(t, -29), to = q.to ?? t;
  const ids = await scopedIds(req, q);
  const rows = await prisma.attendance.findMany({ where: { employeeId: { in: ids }, workDate: { gte: from, lte: to } }, include: { employee: { select: { fullName: true } } }, orderBy: { workDate: 'asc' } });
  const by = (s: string) => rows.filter((r) => r.status === s).length;
  res.json({
    from, to, rows,
    summary: { records: rows.length, present: by('present'), late: by('late'), remote: by('remote'), absent: by('absent'), onLeave: by('on_leave'), workedMinutes: rows.reduce((s, r) => s + r.workedMinutes, 0), overtimeMinutes: rows.filter((r) => r.overtimeStatus !== 'rejected').reduce((s, r) => s + r.overtimeMinutes, 0), attendanceRate: pct(rows.filter((r) => r.clockIn).length, rows.filter((r) => !['public_holiday', 'on_leave'].includes(r.status)).length) },
  });
});

export const payroll = ah(async (req, res) => {
  const runs = await prisma.payroll.findMany({ orderBy: { periodStart: 'asc' }, include: { items: { include: { employee: { select: { fullName: true, departmentId: true } } } } } });
  res.json(runs.map((r) => ({ id: r.id, periodStart: r.periodStart, status: r.status, employees: r.items.length, gross: r.items.reduce((s, i) => s + Number(i.grossPay), 0), net: r.items.reduce((s, i) => s + Number(i.netPay), 0), deductions: r.items.reduce((s, i) => s + Number(i.deductions), 0), bonuses: r.items.reduce((s, i) => s + Number(i.bonuses), 0), basic: r.items.reduce((s, i) => s + Number(i.basicSalary), 0), items: r.items })));
});

/** Everything the reports screens need, already restricted to the caller's authority and the selected filters. */
export const dataset = ah(async (req, res) => {
  const a = actorOf(req);
  const q = query(req, rangeQ);
  const t = todayIn((await settings()).timezone);
  const from = q.from ?? addDays(t, -29), to = q.to ?? t;
  const ids = await scopedIds(req, q);
  const admin = isAdmin(a);
  const [employees, attendance, leave, training, courses, benefits, enrolments, applications, runs] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids } }, include: { department: { select: { name: true } } } }),
    prisma.attendance.findMany({ where: { employeeId: { in: ids }, workDate: { gte: from, lte: to } }, take: 20000 }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, startDate: { lte: to }, endDate: { gte: from } }, include: { leaveType: true } }),
    prisma.employeeTraining.findMany({ where: { employeeId: { in: ids } } }),
    prisma.training.findMany(),
    admin ? prisma.benefit.findMany() : [],
    admin ? prisma.employeeBenefit.findMany({ where: { employeeId: { in: ids } } }) : [],
    admin ? prisma.jobApplication.findMany({ include: { job: { select: { title: true } } } }) : [],
    admin ? prisma.payroll.findMany({ orderBy: { periodStart: 'asc' }, include: { items: { where: { employeeId: { in: ids } } } } }) : [],
  ]);
  res.json({ from, to, employees: employees.map((e) => ({ id: e.id, employeeCode: e.employeeCode, fullName: e.fullName, jobTitle: e.jobTitle, departmentId: e.departmentId, department: e.department?.name ?? null, managerId: e.managerId, status: e.status, employmentType: e.employmentType, startDate: e.startDate })), attendance, leave, training, courses, benefits, enrolments, applications, payroll: runs });
});
