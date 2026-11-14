// Development seed: demo accounts + realistic data.  npm run db:seed
import 'dotenv/config';
import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { computeAttendance } from '../src/lib/attendance-calc';
import { addDays, isoWeekday, todayIn, workingDaysBetween, zonedInstant } from '../src/lib/dates';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/services/auth.service';
import { employeeContext, isWorkingDay } from '../src/services/attendance.service';
import { ensureBalances } from '../src/services/leave-balance';
import * as payroll from '../src/services/payroll.service';

const TZ = 'Europe/London';
const PASSWORD = process.env.SEED_PASSWORD || `Dev-${crypto.randomBytes(9).toString('base64url')}!1`;

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function main() {
  if (await prisma.department.count()) { console.error('Database already has data — it looks seeded. Run `npm run db:reset` first.'); process.exit(1); }
  const today = todayIn(TZ);
  const yr = Number(today.slice(0, 4));
  console.log('Reference data…');
  await prisma.companySettings.upsert({ where: { id: 1 }, update: { companyName: 'HR Connect Demo Ltd', timezone: TZ }, create: { companyName: 'HR Connect Demo Ltd', timezone: TZ } });
  const deptNames = ['Engineering', 'Human Resources', 'Sales', 'Finance', 'Operations', 'Marketing'];
  await prisma.department.createMany({ data: deptNames.map((name) => ({ name })) });
  const D = Object.fromEntries((await prisma.department.findMany()).map((d) => [d.name, d.id]));
  const sched = await prisma.workSchedule.create({ data: { name: 'Standard (Mon–Fri 09:00–17:00)', workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', unpaidBreakMinutes: 0 } });
  await prisma.leaveType.createMany({ data: [
    { name: 'Annual Leave', defaultDays: 25, color: '#2563EB' }, { name: 'Sick Leave', defaultDays: 10, color: '#EF4444' }, { name: 'Emergency Leave', defaultDays: 3, color: '#F59E0B' },
    { name: 'Unpaid Leave', isPaid: false, tracksBalance: false, color: '#64748B' }, { name: 'Parental Leave', tracksBalance: false, color: '#8B5CF6' },
  ] });
  const LT = Object.fromEntries((await prisma.leaveType.findMany()).map((t) => [t.name, t.id]));
  const hols = [`${yr}-01-01`, `${yr}-05-04`, `${yr}-05-25`, `${yr}-08-31`, `${yr}-12-25`, `${yr}-12-26`, `${yr + 1}-01-01`];
  await prisma.holiday.createMany({ data: hols.map((d) => ({ holidayDate: d, name: d.endsWith('12-25') ? 'Christmas Day' : d.endsWith('12-26') ? 'Boxing Day' : d.endsWith('01-01') ? "New Year's Day" : 'Bank Holiday' })) });
  // Placeholder demo rules — NOT real tax or statutory rates. HR must configure real ones.
  await prisma.deductionRule.createMany({ data: [
    { name: 'Demo income deduction (placeholder)', kind: 'percent_of_gross', value: 15 }, { name: 'Demo pension contribution (placeholder)', kind: 'percent_of_gross', value: 5 },
  ] });
  await prisma.benefit.createMany({ data: [
    { name: 'Health Insurance', category: 'health', description: 'Private medical cover', monthlyCost: 85 }, { name: 'Pension (employer contribution)', category: 'pension', description: 'Employer-matched retirement plan', monthlyCost: 180 },
    { name: 'Transport Allowance', category: 'transport', description: 'Monthly commuting allowance', monthlyCost: 60, isAllowance: true }, { name: 'Meal Allowance', category: 'meal', description: 'Lunch allowance', monthlyCost: 45, isAllowance: true },
    { name: 'Wellness Programme', category: 'wellness', description: 'Gym and mental-health support', monthlyCost: 30 }, { name: 'Learning Budget', category: 'other', description: 'Courses and conferences', monthlyCost: 40 },
  ] });
  const B = Object.fromEntries((await prisma.benefit.findMany()).map((b) => [b.name, b]));
  await prisma.training.createMany({ data: [
    { code: 'TRN-SEC101', title: 'Information Security Basics', description: 'Phishing, passwords, data handling', durationHours: 2 },
    { code: 'TRN-HSE101', title: 'Workplace Health & Safety', description: 'Safety essentials', durationHours: 1.5 },
    { code: 'TRN-LDR201', title: 'Inclusive Leadership', description: 'Managing diverse teams', durationHours: 3 },
    { code: 'TRN-GDP101', title: 'Data Protection (GDPR)', description: 'Handling personal data', durationHours: 2 },
  ] });
  const courses = await prisma.training.findMany({ orderBy: { code: 'asc' } });

  console.log('Employees & logins…');
  type P = { n: string; t: string; d: string; s: number; m?: string; login?: 'ADMIN' | 'MANAGER' | 'STAFF'; type?: 'part_time' | 'contract' };
  const people: P[] = [
    { n: 'Amara Okafor', t: 'HR Director', d: 'Human Resources', s: 85000, login: 'ADMIN' }, { n: 'Marcus Reid', t: 'Engineering Manager', d: 'Engineering', s: 92000, login: 'MANAGER' },
    { n: 'Priya Shah', t: 'Software Engineer', d: 'Engineering', s: 64000, m: 'Marcus Reid', login: 'STAFF' }, { n: 'Tom Becker', t: 'Software Engineer', d: 'Engineering', s: 61000, m: 'Marcus Reid' },
    { n: 'Lena Ortiz', t: 'QA Engineer', d: 'Engineering', s: 52000, m: 'Marcus Reid' }, { n: 'Jordan Blake', t: 'Sales Manager', d: 'Sales', s: 78000 },
    { n: 'Chloe Martin', t: 'Account Executive', d: 'Sales', s: 48000, m: 'Jordan Blake' }, { n: 'Ravi Patel', t: 'Sales Associate', d: 'Sales', s: 38000, m: 'Jordan Blake', type: 'contract' },
    { n: 'Sofia Rossi', t: 'Finance Manager', d: 'Finance', s: 80000 }, { n: 'Ben Hughes', t: 'Accountant', d: 'Finance', s: 50000, m: 'Sofia Rossi' },
    { n: 'Grace Kim', t: 'Operations Lead', d: 'Operations', s: 70000 }, { n: 'Omar Haddad', t: 'Operations Analyst', d: 'Operations', s: 45000, m: 'Grace Kim', type: 'part_time' },
    { n: 'Nina Volkov', t: 'Marketing Manager', d: 'Marketing', s: 72000 }, { n: 'Ella Wright', t: 'Content Designer', d: 'Marketing', s: 44000, m: 'Nina Volkov' },
  ];
  const emailOf = (p: P) => p.login ? `${{ ADMIN: 'admin', MANAGER: 'manager', STAFF: 'staff' }[p.login]}@hrconnect.dev` : `${p.n.toLowerCase().replace(/[^a-z]+/g, '.')}@hrconnect.dev`;
  const hash = await hashPassword(PASSWORD);
  const E: Record<string, string> = {};
  let code = 1001;
  for (const p of people) {
    const user = p.login ? await prisma.user.create({ data: { email: emailOf(p), passwordHash: hash, role: p.login } }) : null;
    const e = await prisma.employee.create({ data: { employeeCode: `EMP-${code++}`, userId: user?.id, fullName: p.n, email: emailOf(p), jobTitle: p.t, departmentId: D[p.d], employmentType: p.type ?? 'full_time', startDate: addDays(today, -400 - Math.floor(Math.random() * 600)), scheduleId: sched.id, salary: p.s, phone: `+44 7700 9${String(Math.abs(p.n.length * 7919) % 10000).padStart(5, '0')}`, homeAddress: '12 Demo Street, London' } });
    E[p.n] = e.id;
  }
  for (const p of people.filter((x) => x.m)) await prisma.employee.update({ where: { id: E[p.n] }, data: { managerId: E[p.m!] } });
  await ensureBalances(yr);

  console.log('Attendance (last 6 weeks)…');
  const days: string[] = [];
  for (let i = 42; i >= 1; i--) { const d = addDays(today, -i); if (isoWeekday(d) <= 5 && !hols.includes(d)) days.push(d); }
  const wins = [
    { who: 'Priya Shah', type: 'Annual Leave', start: days[5], end: days[6], reason: 'Long weekend away' }, { who: 'Tom Becker', type: 'Sick Leave', start: days[14], end: days[14], reason: 'Flu' },
    { who: 'Chloe Martin', type: 'Annual Leave', start: days[20], end: days[22], reason: 'Family holiday' },
  ];
  const onLeave = new Set(wins.flatMap((w) => days.filter((d) => d >= w.start && d <= w.end).map((d) => `${w.who}|${d}`)));
  const profile: Record<string, { remote: number; late: number; ot: number }> = { 'Priya Shah': { remote: 0.4, late: 0.1, ot: 0.15 }, 'Tom Becker': { remote: 0.6, late: 0.12, ot: 0.2 }, 'Marcus Reid': { remote: 0.25, late: 0.04, ot: 0.3 } };
  const rows = [];
  for (const p of people) {
    const ctx = await employeeContext(E[p.n]);
    const r = rng(p.n.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
    const pr = profile[p.n] ?? { remote: 0.3, late: 0.08, ot: 0.1 };
    for (const d of days) {
      if (onLeave.has(`${p.n}|${d}`) || r() < 0.03) continue;
      const late = r() < pr.late ? 12 + Math.floor(r() * 40) : Math.floor(r() * 4);
      const ot = r() < pr.ot ? 30 + Math.floor(r() * 90) : 0;
      const early = ot === 0 && r() < 0.04 ? 25 : 0;
      const location = r() < pr.remote ? 'remote' as const : 'office' as const;
      const clockIn = zonedInstant(d, hm(540 + late), TZ), clockOut = zonedInstant(d, hm(1020 + ot - early), TZ);
      const c = computeAttendance({ workDate: d, tz: TZ, clockIn, clockOut, breaks: [], isWorkingDay: isWorkingDay(ctx, d), schedule: ctx.schedule, graceMinutes: 5, location });
      const { status, ...rest } = c;
      rows.push({ employeeId: E[p.n], workDate: d, clockIn, clockOut, workLocation: location, ...rest, status: status ?? 'present' as const, overtimeStatus: (c.overtimeMinutes > 0 ? (d < addDays(today, -21) ? 'approved' : 'pending') : 'none') as 'none' | 'pending' | 'approved' });
    }
  }
  await prisma.attendance.createMany({ data: rows });

  const holidaySet = new Set(hols);
  for (const w of wins) {
    const wd = workingDaysBetween(w.start, w.end, [1, 2, 3, 4, 5], holidaySet);
    await prisma.leaveRequest.create({ data: { employeeId: E[w.who], leaveTypeId: LT[w.type], startDate: w.start, endDate: w.end, workingDays: wd, reason: w.reason, status: 'approved', reviewedById: E['Marcus Reid'], reviewedAt: new Date() } });
    await prisma.leaveBalance.updateMany({ where: { employeeId: E[w.who], leaveTypeId: LT[w.type], year: yr }, data: { used: wd } });
    await prisma.attendance.createMany({ data: days.filter((d) => d >= w.start && d <= w.end).map((d) => ({ employeeId: E[w.who], workDate: d, status: 'on_leave' as const, scheduledMinutes: 0 })) });
  }
  const future = (n: number) => { let d = addDays(today, n); while (isoWeekday(d) > 5) d = addDays(d, 1); return d; };
  for (const [who, type, a, b, reason] of [['Priya Shah', 'Annual Leave', future(14), future(16), 'Visiting family'], ['Lena Ortiz', 'Annual Leave', future(21), future(25), 'Summer break'], ['Ben Hughes', 'Emergency Leave', future(3), future(3), 'Family matter']] as const) {
    await prisma.leaveRequest.create({ data: { employeeId: E[who], leaveTypeId: LT[type], startDate: a, endDate: b, workingDays: workingDaysBetween(a, b, [1, 2, 3, 4, 5], holidaySet), reason } });
  }

  console.log('Benefits, training, recruitment…');
  const enrol: { employeeId: string; benefitId: string; monthlyCost: number; startDate: string }[] = [];
  for (const p of people) {
    const add = (name: string) => enrol.push({ employeeId: E[p.n], benefitId: B[name].id, monthlyCost: Number(B[name].monthlyCost), startDate: addDays(today, -200) });
    add('Health Insurance'); add('Pension (employer contribution)');
    if (['Engineering', 'Sales'].includes(p.d)) add('Meal Allowance');
    if (p.m) add('Transport Allowance');
    if (['Marketing', 'Human Resources'].includes(p.d)) add('Wellness Programme');
  }
  await prisma.employeeBenefit.createMany({ data: enrol });
  const r2 = rng(99);
  const tr = [];
  for (const p of people) for (const c of courses.slice(0, 2 + Math.floor(r2() * 2))) {
    const progress = [0, 25, 50, 75, 100][Math.floor(r2() * 5)];
    const due = addDays(today, Math.floor(r2() * 50) - 15);
    tr.push({ trainingId: c.id, employeeId: E[p.n], assignedById: E['Amara Okafor'], assignedDate: addDays(today, -30), dueDate: due, progress, completionDate: progress === 100 ? addDays(today, -5) : null,
      status: (progress === 100 ? 'completed' : due < today ? 'overdue' : progress > 0 ? 'in_progress' : 'not_started') as 'completed' | 'overdue' | 'in_progress' | 'not_started' });
  }
  await prisma.employeeTraining.createMany({ data: tr });

  const jobs = await Promise.all([
    prisma.jobPosting.create({ data: { title: 'Senior Backend Engineer', departmentId: D.Engineering, location: 'London / Hybrid', description: 'Build scalable services.' } }),
    prisma.jobPosting.create({ data: { title: 'Sales Development Rep', departmentId: D.Sales, location: 'London', description: 'Own top-of-funnel.' } }),
    prisma.jobPosting.create({ data: { title: 'Finance Intern', departmentId: D.Finance, location: 'Remote', employmentType: 'intern', description: 'Support month-end close.' } }),
    prisma.jobPosting.create({ data: { title: 'Brand Designer', departmentId: D.Marketing, employmentType: 'contract', status: 'closed' } }),
  ]);
  const stages = ['applied', 'screening', 'interview', 'interview', 'offered', 'offered', 'rejected', 'screening'] as const;
  const names = ['Alex Morgan', 'Sam Chen', 'Dana Okoye', 'Kai Larsen', 'Mira Novak', 'Leo Fischer', 'Zoe Adams', 'Ivan Petrov'];
  for (let i = 0; i < names.length; i++) {
    const cand = await prisma.candidate.create({ data: { fullName: names[i], email: `${names[i].toLowerCase().replace(' ', '.')}@example.com` } });
    const app = await prisma.jobApplication.create({ data: { jobId: jobs[i % 3].id, candidateId: cand.id, status: stages[i], rating: stages[i] === 'applied' ? null : 3 + (i % 3), hiringApproved: i === 5, offerSalary: stages[i] === 'offered' ? 55000 : null } });
    if (['interview', 'offered'].includes(stages[i])) await prisma.interview.create({ data: { applicationId: app.id, interviewerId: E[i % 2 ? 'Marcus Reid' : 'Jordan Blake'], scheduledAt: DateTime.fromISO(`${addDays(today, i - 3)}T14:00`, { zone: TZ }).toJSDate(), mode: i % 2 ? 'video' : 'onsite' } });
  }

  console.log('Payroll (through the real services)…');
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@hrconnect.dev' } });
  const first = (back: number) => DateTime.fromISO(today).minus({ months: back }).startOf('month').toISODate()!;
  for (const back of [2, 1]) {
    const run = await payroll.processPayroll(admin.id, first(back));
    await payroll.approve(admin.id, run.id);
    if (back === 2) await payroll.markPaid(admin.id, run.id);
  }
  await payroll.processPayroll(admin.id, first(0));

  console.log('\n✔ Seed complete.\n\nDemo accounts (development only):');
  console.log('  Admin / HR : admin@hrconnect.dev\n  Manager    : manager@hrconnect.dev\n  Staff      : staff@hrconnect.dev');
  console.log(`  Password   : ${PASSWORD}${process.env.SEED_PASSWORD ? '  (from SEED_PASSWORD)' : '  (randomly generated — save it now)'}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
