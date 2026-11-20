import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, isoWeekday, todayIn } from '../src/lib/dates';
import { prisma } from '../src/lib/prisma';
import { app, authed, login, request, resetDb, seedBasic } from './helpers';

let s: Awaited<ReturnType<typeof seedBasic>>;
let T: Record<'admin' | 'manager' | 'staff' | 'other', string>;
const today = () => todayIn('Europe/London');
/** Next Monday-Friday date at least `n` days away. */
const workday = (n: number) => { let d = addDays(today(), n); while (isoWeekday(d) > 5) d = addDays(d, 1); return d; };
const get = (key: keyof typeof T, url: string) => request(app).get(url).set(authed(T[key]));
const send = (method: 'post' | 'patch' | 'delete', key: keyof typeof T, url: string, body?: object) => request(app)[method](url).set(authed(T[key])).send(body);

beforeEach(async () => {
  await resetDb();
  s = await seedBasic();
  T = { admin: (await login('admin')).token, manager: (await login('manager')).token, staff: (await login('staff')).token, other: (await login('other')).token };
});

describe('employee data protection', () => {
  it('admin sees salary and private contact data; managers and colleagues do not', async () => {
    const asAdmin = (await get('admin', `/api/employees/${s.staff.emp.id}`)).body;
    expect(asAdmin).toMatchObject({ salary: 60000, phone: 'phone-staff' });
    for (const who of ['manager', 'other'] as const) {
      const body = (await get(who, `/api/employees/${s.staff.emp.id}`)).body;
      expect(body.fullName).toBe('staff');
      expect(body).not.toHaveProperty('salary'); expect(body).not.toHaveProperty('phone'); expect(body).not.toHaveProperty('homeAddress');
    }
    const list = (await get('manager', '/api/employees')).body as Record<string, unknown>[];
    expect(list.length).toBe(4);
    expect(list.every((e) => !('salary' in e) || e.fullName === 'manager')).toBe(true); // only their own salary
  });

  it('employee self-service: can edit own phone, nothing else, nobody else', async () => {
    expect((await send('patch', 'staff', `/api/employees/${s.staff.emp.id}`, { phone: '+44 123' })).status).toBe(200);
    expect((await get('staff', `/api/employees/${s.staff.emp.id}`)).body.phone).toBe('+44 123');
    expect((await send('patch', 'staff', `/api/employees/${s.staff.emp.id}`, { salary: 999999 })).status).toBe(400);
    expect((await send('patch', 'staff', `/api/employees/${s.staff.emp.id}`, { jobTitle: 'CEO' })).status).toBe(400);
    expect((await send('patch', 'staff', `/api/employees/${s.other.emp.id}`, { phone: 'x' })).status).toBe(403);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: s.staff.emp.id } })).salary.toNumber()).toBe(60000);
  });

  it('only admin can create / edit / deactivate employees and change roles', async () => {
    const body = { fullName: 'Nia Test', email: 'nia@test.io', startDate: '2026-01-05', salary: 40000, login: { password: 'Test-Password-123', role: 'STAFF' } };
    expect((await send('post', 'manager', '/api/employees', body)).status).toBe(403);
    const created = await send('post', 'admin', '/api/employees', body);
    expect(created.status).toBe(201);
    expect(created.body.employeeCode).toMatch(/^EMP-\d+$/);
    expect((await send('post', 'admin', '/api/employees', body)).status).toBe(409); // duplicate email
    expect((await send('patch', 'manager', `/api/employees/${s.staff.emp.id}`, { jobTitle: 'x' })).status).toBe(403);
    expect((await send('patch', 'admin', `/api/employees/${s.staff.emp.id}`, { loginRole: 'MANAGER' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.staff.user.id } })).role).toBe('MANAGER');
    expect((await send('patch', 'admin', `/api/employees/${s.staff.emp.id}`, { managerId: s.staff.emp.id })).status).toBe(400);
    const audits = await prisma.auditLog.findMany({ where: { action: { in: ['EMPLOYEE_CREATED', 'ROLE_CHANGED'] } } });
    expect(audits.length).toBe(2);
  });

  it('profile data tabs: payslip history is HR-only, documents follow visibility rules', async () => {
    expect((await get('manager', `/api/payroll/payslips/employee/${s.staff.emp.id}`)).status).toBe(403);
    expect((await get('staff', `/api/payroll/payslips/employee/${s.staff.emp.id}`)).status).toBe(403);
    expect((await get('admin', `/api/payroll/payslips/employee/${s.staff.emp.id}`)).body).toEqual([]);
    expect((await get('staff', `/api/employees/${s.staff.emp.id}/documents`)).status).toBe(200);
    expect((await get('manager', `/api/employees/${s.staff.emp.id}/documents`)).status).toBe(403); // personal documents need an approved DOCUMENTS grant (see staff-access tests)
    expect((await get('other', `/api/employees/${s.staff.emp.id}/documents`)).status).toBe(403);
  });

  it('validates input with Zod', async () => {
    const r = await send('post', 'admin', '/api/employees', { fullName: '', email: 'bad', startDate: 'yesterday' });
    expect(r.status).toBe(400);
  });
});

describe('attendance', () => {
  it('clock in → break → clock out records hours, location and blocks bad sequences', async () => {
    const ci = await send('post', 'staff', '/api/attendance/clock-in', { location: 'remote' });
    expect(ci.status).toBe(201);
    expect(['remote', 'late']).toContain(ci.body.status);
    expect((await send('post', 'staff', '/api/attendance/clock-in', { location: 'office' })).status).toBe(409);
    expect((await send('post', 'staff', '/api/attendance/clock-in', { location: 'mars' })).status).toBe(400);
    expect((await send('post', 'staff', '/api/attendance/end-break')).status).toBe(400);
    expect((await send('post', 'staff', '/api/attendance/start-break')).status).toBe(200);
    expect((await send('post', 'staff', '/api/attendance/start-break')).status).toBe(409);
    expect((await send('post', 'staff', '/api/attendance/end-break')).status).toBe(200);
    const co = await send('post', 'staff', '/api/attendance/clock-out');
    expect(co.status).toBe(200);
    expect(co.body.clockOut).toBeTruthy(); expect(co.body.workedMinutes).toBeGreaterThanOrEqual(0);
    expect((await send('post', 'staff', '/api/attendance/clock-out')).status).toBe(400);
    const today = (await get('staff', '/api/attendance/today')).body;
    expect(today.record.workLocation).toBe('remote');
  });

  it('visibility: staff see only their own, managers their reports, admin everyone', async () => {
    const mk = (e: { id: string }) => prisma.attendance.create({ data: { employeeId: e.id, workDate: addDays(today(), -1), clockIn: new Date(), clockOut: new Date(), workLocation: 'office', workedMinutes: 480 } });
    await Promise.all([s.staff.emp, s.other.emp, s.manager.emp].map(mk));
    expect((await get('staff', '/api/attendance/team')).status).toBe(403);
    expect((await get('manager', '/api/attendance/team')).body.map((r: { employeeId: string }) => r.employeeId)).toEqual([s.staff.emp.id]);
    expect((await get('admin', '/api/attendance/team')).body.length).toBe(3);
    expect((await get('manager', `/api/attendance/team?employeeId=${s.other.emp.id}`)).status).toBe(403);
    expect((await get('staff', '/api/attendance/me')).body.length).toBe(1);
    const wk = (await get('manager', '/api/attendance/weekly?scope=team')).body;
    expect(wk.days).toHaveLength(5);
  });

  it('overtime approval: manager approves a report; cannot approve own; other managers cannot', async () => {
    const rec = (id: string) => prisma.attendance.create({ data: { employeeId: id, workDate: addDays(today(), -3), clockIn: new Date(), clockOut: new Date(), overtimeMinutes: 60, overtimeStatus: 'pending' } });
    const team = await rec(s.staff.emp.id), own = await rec(s.manager.emp.id), foreign = await rec(s.other.emp.id);
    expect((await send('patch', 'manager', `/api/attendance/${team.id}/overtime`, { approve: true })).body.overtimeStatus).toBe('approved');
    expect((await send('patch', 'manager', `/api/attendance/${team.id}/overtime`, { approve: true })).status).toBe(400); // already decided
    expect((await send('patch', 'manager', `/api/attendance/${own.id}/overtime`, { approve: true })).status).toBe(403);
    expect((await send('patch', 'manager', `/api/attendance/${foreign.id}/overtime`, { approve: true })).status).toBe(403);
    expect((await send('patch', 'staff', `/api/attendance/${foreign.id}/overtime`, { approve: true })).status).toBe(403);
    expect((await send('patch', 'admin', `/api/attendance/${foreign.id}/overtime`, { approve: true })).status).toBe(200);
  });

  it('attendance correction request → manager approval rewrites the record', async () => {
    const d = addDays(today(), -2);
    const r = await send('post', 'staff', '/api/attendance/corrections', { workDate: d, clockIn: '09:00', clockOut: '18:00', location: 'office', reason: 'Forgot to clock' });
    expect(r.status).toBe(201);
    expect((await send('patch', 'staff', `/api/attendance/corrections/${r.body.id}/approve`)).status).toBe(403);
    expect((await send('patch', 'other', `/api/attendance/corrections/${r.body.id}/approve`)).status).toBe(403);
    expect((await send('patch', 'manager', `/api/attendance/corrections/${r.body.id}/approve`)).status).toBe(200);
    expect((await send('patch', 'manager', `/api/attendance/corrections/${r.body.id}/approve`)).status).toBe(409);
    const rec = await prisma.attendance.findFirstOrThrow({ where: { employeeId: s.staff.emp.id, workDate: d } });
    expect(rec.workedMinutes).toBe(540); expect(rec.overtimeMinutes).toBe(60);
  });

  it('close-day is admin-only and records absences', async () => {
    expect((await send('post', 'manager', '/api/attendance/close-day', {})).status).toBe(403);
    let d = addDays(today(), -1); while (isoWeekday(d) > 5) d = addDays(d, -1);
    const r = await send('post', 'admin', '/api/attendance/close-day', { date: d });
    expect(r.body.recorded).toBe(4);
    expect(await prisma.attendance.count({ where: { workDate: d, status: 'absent' } })).toBe(4);
  });
});

describe('leave workflow', () => {
  const annual = () => prisma.leaveType.findFirstOrThrow({ where: { name: 'Annual Leave' } });

  it('request excludes weekends/holidays, manager approves, balance and attendance update; cancel refunds', async () => {
    const t = await annual();
    // pick a Monday at least 2 weeks away; Mon–Fri next week + weekend = 5 working days, with a holiday on Wednesday → 4
    let mon = addDays(today(), 14); while (isoWeekday(mon) !== 1) mon = addDays(mon, 1);
    await prisma.holiday.create({ data: { holidayDate: addDays(mon, 2), name: 'Test Holiday' } });
    const r = await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: mon, endDate: addDays(mon, 6), reason: 'Trip' });
    expect(r.status).toBe(201);
    expect(r.body.workingDays).toBe(4);
    expect((await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: addDays(mon, 1), endDate: addDays(mon, 1) })).status).toBe(409); // overlap
    expect((await send('patch', 'staff', `/api/leaves/${r.body.id}/approve`)).status).toBe(403);
    expect((await send('patch', 'other', `/api/leaves/${r.body.id}/approve`)).status).toBe(403);
    expect((await get('other', '/api/leaves')).body).toHaveLength(0); // unrelated staff cannot even see it
    expect((await get('manager', '/api/leaves')).body).toHaveLength(1);
    expect((await prisma.notification.count({ where: { userId: s.manager.user.id, kind: 'leave' } }))).toBe(1);
    const ok = await send('patch', 'manager', `/api/leaves/${r.body.id}/approve`, { note: 'enjoy' });
    expect(ok.body.status).toBe('approved');
    expect((await send('patch', 'manager', `/api/leaves/${r.body.id}/approve`)).status).toBe(409);
    const bal = await prisma.leaveBalance.findFirstOrThrow({ where: { employeeId: s.staff.emp.id, leaveTypeId: t.id } });
    expect(bal.used).toBe(4);
    expect(await prisma.attendance.count({ where: { employeeId: s.staff.emp.id, status: 'on_leave' } })).toBe(4);
    expect(await prisma.notification.count({ where: { userId: s.staff.user.id, title: 'Leave approved' } })).toBe(1);
    expect((await send('post', 'staff', '/api/attendance/clock-in', { location: 'office' })).status).toBe(201); // not on leave today
    const c = await send('patch', 'staff', `/api/leaves/${r.body.id}/cancel`);
    expect(c.body.status).toBe('cancelled');
    expect((await prisma.leaveBalance.findFirstOrThrow({ where: { employeeId: s.staff.emp.id, leaveTypeId: t.id } })).used).toBe(0);
    expect(await prisma.attendance.count({ where: { employeeId: s.staff.emp.id, status: 'on_leave' } })).toBe(0);
  });

  it('rejects requests over the remaining balance, with no working days, or ending before they start', async () => {
    const t = await annual();
    expect((await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: workday(30), endDate: addDays(workday(30), 60) })).status).toBe(400);
    let sat = addDays(today(), 20); while (isoWeekday(sat) !== 6) sat = addDays(sat, 1);
    expect((await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: sat, endDate: addDays(sat, 1) })).status).toBe(400);
    expect((await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: workday(9), endDate: workday(5) })).status).toBe(400);
  });

  it('a manager cannot approve their own leave; admin can approve the manager\'s', async () => {
    const t = await annual();
    const r = await send('post', 'manager', '/api/leaves', { leaveTypeId: t.id, startDate: workday(10), endDate: workday(10) });
    expect((await send('patch', 'manager', `/api/leaves/${r.body.id}/approve`)).status).toBe(403);
    expect((await send('patch', 'admin', `/api/leaves/${r.body.id}/reject`, { note: 'busy' })).body.status).toBe('rejected');
  });
});

describe('payroll', () => {
  it('only admin can process; staff and managers are blocked from company payroll', async () => {
    for (const who of ['staff', 'manager'] as const) {
      expect((await send('post', who, '/api/payroll/process', { month: '2026-01-01' })).status).toBe(403);
      expect((await get(who, '/api/payroll')).status).toBe(403);
    }
  });

  it('process → bonus → approve → payslips: employees only see their own', async () => {
    await prisma.deductionRule.create({ data: { name: 'Demo 10%', country: 'GB', kind: 'percent_of_gross', value: 10 } });
    const run = await send('post', 'admin', '/api/payroll/process', { month: '2026-01-15' });
    expect(run.status).toBe(201);
    const item = run.body.items.find((i: { employeeId: string }) => i.employeeId === s.staff.emp.id);
    expect(item).toMatchObject({ basicSalary: 5000, deductions: 500, netPay: 4500 });
    expect((await send('post', 'admin', '/api/payroll/process', { month: '2026-01-02' })).status).toBe(409);
    const withBonus = await send('patch', 'admin', `/api/payroll/items/${item.id}/bonus`, { bonus: 1000 });
    expect(withBonus.body).toMatchObject({ grossPay: 6000, deductions: 600, netPay: 5400 });
    expect((await send('patch', 'staff', `/api/payroll/${run.body.id}/approve`)).status).toBe(403);
    expect((await get('staff', '/api/payroll/payslips/me')).body).toHaveLength(0); // nothing before approval
    expect((await send('patch', 'admin', `/api/payroll/${run.body.id}/approve`)).status).toBe(200);
    expect((await send('patch', 'admin', `/api/payroll/${run.body.id}/approve`)).status).toBe(400);
    expect((await send('patch', 'admin', `/api/payroll/items/${item.id}/bonus`, { bonus: 5 })).status).toBe(400); // locked
    const mine = (await get('staff', '/api/payroll/payslips/me')).body;
    expect(mine).toHaveLength(1);
    expect(mine[0].netPay).toBe(5400);
    expect((await get('other', `/api/payroll/payslips/${mine[0].id}`)).status).toBe(404); // not even existence is revealed
    expect((await get('staff', `/api/payroll/payslips/${mine[0].id}`)).status).toBe(200);
    expect((await get('manager', '/api/payroll/payslips/me')).body).toHaveLength(1); // managers get only their own payslip
    expect((await send('patch', 'admin', `/api/payroll/${run.body.id}/paid`)).body.status).toBe('paid');
    expect(await prisma.auditLog.count({ where: { entity: { startsWith: 'Payroll' } } })).toBeGreaterThanOrEqual(3);
    expect((await get('staff', '/api/reports/payroll')).status).toBe(403);
  });

  it('approved overtime is paid at the configured multiplier', async () => {
    await prisma.attendance.create({ data: { employeeId: s.staff.emp.id, workDate: '2026-02-03', clockIn: new Date(), clockOut: new Date(), overtimeMinutes: 60, overtimeStatus: 'approved' } });
    const run = await send('post', 'admin', '/api/payroll/process', { month: '2026-02-01' });
    const item = run.body.items.find((i: { employeeId: string }) => i.employeeId === s.staff.emp.id);
    expect(item.overtimePay).toBe(43.27); // 60000 / (52 × 40) × 1.5
  });
});

describe('training, benefits, recruitment, reports', () => {
  it('manager assigns to reports only; only the assignee updates progress', async () => {
    const c = await prisma.training.create({ data: { code: 'T1', title: 'Security' } });
    const due = addDays(today(), 10);
    expect((await send('post', 'manager', '/api/training/assign', { trainingId: c.id, employeeId: s.staff.emp.id, dueDate: due })).status).toBe(201);
    expect((await send('post', 'manager', '/api/training/assign', { trainingId: c.id, employeeId: s.staff.emp.id, dueDate: due })).status).toBe(409);
    expect((await send('post', 'manager', '/api/training/assign', { trainingId: c.id, employeeId: s.other.emp.id, dueDate: due })).status).toBe(403);
    expect((await send('post', 'staff', '/api/training/assign', { trainingId: c.id, employeeId: s.other.emp.id, dueDate: due })).status).toBe(403);
    const a = await prisma.employeeTraining.findFirstOrThrow({ where: { employeeId: s.staff.emp.id } });
    expect((await send('patch', 'manager', `/api/training/assignments/${a.id}/progress`, { progress: 50 })).status).toBe(404);
    expect((await send('patch', 'staff', `/api/training/assignments/${a.id}/progress`, { progress: 50 })).body.status).toBe('in_progress');
    expect((await send('patch', 'staff', `/api/training/assignments/${a.id}/progress`, { progress: 100 })).body.status).toBe('completed');
    expect((await send('patch', 'staff', `/api/training/assignments/${a.id}/progress`, { progress: 150 })).status).toBe(400);
    expect((await get('other', '/api/training')).body.assignments).toHaveLength(0);
  });

  it('benefit costs and enrolments are hidden from non-HR', async () => {
    const b = await prisma.benefit.create({ data: { name: 'Gym', category: 'wellness', monthlyCost: 30 } });
    expect((await send('post', 'staff', '/api/benefits/enrolments', { employeeId: s.staff.emp.id, benefitId: b.id })).status).toBe(403);
    expect((await send('post', 'admin', '/api/benefits/enrolments', { employeeId: s.staff.emp.id, benefitId: b.id })).status).toBe(201);
    const staffView = (await get('staff', '/api/benefits')).body;
    expect(staffView.enrolments).toHaveLength(1); expect(staffView.benefits[0]).not.toHaveProperty('monthlyCost');
    expect((await get('other', '/api/benefits')).body.enrolments).toHaveLength(0);
    expect((await get('admin', '/api/benefits')).body.benefits[0].monthlyCost).toBe(30);
  });

  it('recruitment is HR-only; hiring requires an approved offer and creates an employee', async () => {
    for (const who of ['staff', 'manager'] as const) expect((await get(who, '/api/recruitment')).status).toBe(403);
    const job = (await send('post', 'admin', '/api/recruitment/jobs', { title: 'QA Engineer', departmentId: s.dept.id })).body;
    const app = (await send('post', 'admin', '/api/recruitment/applications', { jobId: job.id, fullName: 'Eve Hire', email: 'eve@test.io' })).body;
    expect((await send('post', 'admin', `/api/recruitment/applications/${app.id}/hire`, { startDate: '2026-03-01' })).status).toBe(400);
    await send('patch', 'admin', `/api/recruitment/applications/${app.id}`, { status: 'offered', offerSalary: 55000 });
    expect((await send('post', 'admin', `/api/recruitment/applications/${app.id}/hire`, { startDate: '2026-03-01' })).status).toBe(400);
    await send('patch', 'admin', `/api/recruitment/applications/${app.id}`, { hiringApproved: true });
    const hired = await send('post', 'admin', `/api/recruitment/applications/${app.id}/hire`, { startDate: '2026-03-01' });
    expect(hired.status).toBe(201);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: hired.body.id } })).salary.toNumber()).toBe(55000);
    expect((await send('post', 'admin', `/api/recruitment/applications/${app.id}/hire`, { startDate: '2026-03-01' })).status).toBe(400);
  });

  it('dashboard and reports are scoped to the caller', async () => {
    const admin = (await get('admin', '/api/reports/dashboard')).body;
    const mgr = (await get('manager', '/api/reports/dashboard')).body;
    const staff = (await get('staff', '/api/reports/dashboard')).body;
    expect(admin.totalEmployees).toBe(4); expect(mgr.totalEmployees).toBe(2); expect(staff.totalEmployees).toBe(1);
    expect(admin.monthlyPayroll).toBeNull(); expect(mgr).not.toHaveProperty('monthlyPayroll', expect.anything());
    expect((await get('staff', '/api/reports/attendance')).status).toBe(403);
    const ds = (await get('manager', '/api/reports/dataset')).body;
    expect(ds.employees.map((e: { id: string }) => e.id).sort()).toEqual([s.manager.emp.id, s.staff.emp.id].sort());
    expect(ds.employees[0]).not.toHaveProperty('salary');
    expect(ds.payroll).toEqual([]);
  });

  it('dashboard approvals, activity and payroll trend respect scope', async () => {
    const t = await prisma.leaveType.findFirstOrThrow({ where: { name: 'Annual Leave' } });
    await send('post', 'staff', '/api/leaves', { leaveTypeId: t.id, startDate: workday(12), endDate: workday(12) });
    await send('post', 'other', '/api/leaves', { leaveTypeId: t.id, startDate: workday(13), endDate: workday(13) });
    await send('post', 'admin', '/api/payroll/process', { month: '2026-01-15' });
    const mgr = (await get('manager', '/api/reports/dashboard')).body;
    expect(mgr.pendingApprovals.leave.map((l: { employee: string }) => l.employee)).toEqual(['staff']); // not the unrelated employee
    expect(mgr.payrollTrend).toEqual([]); expect(mgr.latestPayroll).toBeNull();
    const staff = (await get('staff', '/api/reports/dashboard')).body;
    expect(staff.pendingApprovals.leave).toEqual([]);
    expect(staff.myRequests).toHaveLength(1);
    const admin = (await get('admin', '/api/reports/dashboard')).body;
    expect(admin.pendingApprovals.leave).toHaveLength(2);
    expect(admin.payrollTrend).toHaveLength(1);
    expect(admin.payrollTrend[0].gross).toBeGreaterThan(0);
    expect(admin.presentTrend.length).toBeGreaterThan(5);
  });

  it('notifications are private to their owner', async () => {
    await prisma.notification.create({ data: { userId: s.staff.user.id, title: 'Hi' } });
    expect((await get('staff', '/api/notifications')).body.unread).toBe(1);
    expect((await get('other', '/api/notifications')).body.items).toHaveLength(0);
    const n = await prisma.notification.findFirstOrThrow();
    await send('patch', 'other', `/api/notifications/${n.id}/read`);
    expect((await prisma.notification.findFirstOrThrow()).isRead).toBe(false);
  });
});
