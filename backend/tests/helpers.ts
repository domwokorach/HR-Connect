import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/services/auth.service';

export const app = createApp();
export const PASSWORD = 'Test-Password-123';
export const web = { 'X-Client-Type': 'web' };
export const mobile = { 'X-Client-Type': 'mobile' };

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Admin, manager (with one report: staff) and an unrelated staff member, plus schedule/leave types. */
export async function seedBasic() {
  await prisma.companySettings.create({ data: { id: 1, timezone: 'Europe/London' } });
  const sched = await prisma.workSchedule.create({ data: { name: 'Standard', workDays: [1, 2, 3, 4, 5] } });
  const dept = await prisma.department.create({ data: { name: 'Engineering' } });
  await prisma.leaveType.create({ data: { name: 'Annual Leave', defaultDays: 25 } });
  await prisma.leaveType.create({ data: { name: 'Sick Leave', defaultDays: 10, requiresDocument: false } });
  const hash = await hashPassword(PASSWORD);
  const mk = async (key: string, role: 'ADMIN' | 'MANAGER' | 'STAFF', salary: number, managerId?: string) => {
    const user = await prisma.user.create({ data: { email: `${key}@test.io`, passwordHash: hash, role } });
    const emp = await prisma.employee.create({ data: { employeeCode: `EMP-${1000 + Math.floor(Math.random() * 9000)}`, userId: user.id, fullName: key, email: `${key}@test.io`, startDate: '2020-01-01', departmentId: dept.id, scheduleId: sched.id, salary, phone: `phone-${key}`, managerId } });
    return { user, emp };
  };
  const admin = await mk('admin', 'ADMIN', 90000);
  const manager = await mk('manager', 'MANAGER', 80000);
  const staff = await mk('staff', 'STAFF', 60000, manager.emp.id);
  const other = await mk('other', 'STAFF', 50000);
  return { admin, manager, staff, other, sched, dept };
}

export async function login(key: string, headers: Record<string, string> = mobile) {
  const res = await request(app).post('/api/auth/login').set(headers).send({ email: `${key}@test.io`, password: PASSWORD });
  return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string | undefined, res };
}
export const authed = (token: string) => ({ Authorization: `Bearer ${token}`, ...mobile });
export { request };
