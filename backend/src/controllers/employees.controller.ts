import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { Prisma, prisma, type Tx } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import { assertCanViewEmployee, isAdmin, toEmployeeDto } from '../services/access';
import { audit } from '../services/audit';
import { activeGrants, requireScope } from '../services/staff-access.service';
import { hashPassword } from '../services/auth.service';
import { ensureBalances } from '../services/leave-balance';
import { revokeAllForUser } from '../services/tokens';
import { createEmployee, listQuery, selfUpdate, updateEmployee } from '../validators/employees';
import { todayIn } from '../lib/dates';

const include = { department: { select: { id: true, name: true } }, user: { select: { role: true, isActive: true } } } satisfies Prisma.EmployeeInclude;

async function nextCode(tx: Tx) {
  const rows = await tx.employee.findMany({ select: { employeeCode: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.employeeCode.replace(/\D/g, '')) || 1000), 1000);
  return `EMP-${max + 1}`;
}

export const list = ah(async (req, res) => {
  const a = actorOf(req);
  const q = query(req, listQuery);
  const where: Prisma.EmployeeWhereInput = {
    ...(q.departmentId && { departmentId: q.departmentId }), ...(q.managerId && { managerId: q.managerId }), ...(q.status && { status: q.status }),
    ...(q.q && { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { jobTitle: { contains: q.q, mode: 'insensitive' } }, { employeeCode: { contains: q.q, mode: 'insensitive' } }] }),
  };
  const rows = await prisma.employee.findMany({ where, include, orderBy: { fullName: 'asc' } });
  const grants = a.role === 'MANAGER' ? await activeGrants(a.employeeId) : new Map();
  res.json(rows.map((e) => toEmployeeDto(e, a, grants.get(e.id))));
});

export const create = ah(async (req, res) => {
  const a = actorOf(req);
  const { login, salary, ...d } = body(req, createEmployee);
  const emp = await prisma.$transaction(async (tx) => {
    const e = await tx.employee.create({ data: { ...d, salary: salary ?? 0, employeeCode: await nextCode(tx) } });
    if (login) {
      const u = await tx.user.create({ data: { email: e.email, passwordHash: await hashPassword(login.password), role: login.role, mustChangePassword: true } });
      await tx.employee.update({ where: { id: e.id }, data: { userId: u.id } });
      await audit({ actorId: a.userId, action: 'USER_REGISTERED', entity: 'User', entityId: u.id, after: { email: u.email, role: u.role } }, tx);
    }
    await ensureBalances(Number(todayIn('UTC').slice(0, 4)), e.id, tx);
    await audit({ actorId: a.userId, action: 'EMPLOYEE_CREATED', entity: 'Employee', entityId: e.id, after: e }, tx);
    return tx.employee.findUniqueOrThrow({ where: { id: e.id }, include });
  });
  res.status(201).json(toEmployeeDto(emp, a));
});

export const get = ah(async (req, res) => {
  const a = actorOf(req);
  const id = String(req.params.id);
  const e = await prisma.employee.findUnique({ where: { id }, include });
  if (!e) throw notFound('Employee not found');
  let extra = {};
  try {
    await assertCanViewEmployee(a, id);
    const year = Number(todayIn('UTC').slice(0, 4));
    const [balances, trainings] = await Promise.all([
      prisma.leaveBalance.findMany({ where: { employeeId: id, year }, include: { leaveType: true } }),
      prisma.employeeTraining.findMany({ where: { employeeId: id }, select: { status: true, progress: true, dueDate: true } }),
    ]);
    extra = { balances, trainings };
  } catch { /* colleagues only get directory fields */ }
  const granted = a.role === 'MANAGER' ? (await activeGrants(a.employeeId, [id])).get(id) : undefined;
  if (granted?.size) await audit({ actorId: a.userId, action: 'STAFF_DATA_VIEWED', entity: 'Employee', entityId: id, after: { scopes: [...granted] } });
  res.json({ ...toEmployeeDto(e, a, granted), ...extra });
});

/** Uploaded documents tied to an employee: their leave attachments, and the CV if they were hired through recruitment. */
export const documents = ah(async (req, res) => {
  const a = actorOf(req);
  const id = String(req.params.id);
  await assertCanViewEmployee(a, id);
  await requireScope(a, id, 'DOCUMENTS'); // personal documents are confidential: a manager needs an approved grant
  const files = await prisma.fileUpload.findMany({ where: { ownerId: id, kind: 'leave_document' }, orderBy: { createdAt: 'desc' } });
  const docs = files.map((f) => ({ id: f.id, name: f.originalName, kind: 'Leave document', size: f.size, createdAt: f.createdAt }));
  if (isAdmin(a)) { // CVs are recruitment data: HR only
    const app = await prisma.jobApplication.findFirst({ where: { hiredEmployeeId: id }, include: { candidate: true } });
    if (app?.candidate.resumeId) {
      const f = await prisma.fileUpload.findUnique({ where: { id: app.candidate.resumeId } });
      if (f) docs.push({ id: f.id, name: f.originalName, kind: 'CV / resume', size: f.size, createdAt: f.createdAt });
    }
  }
  res.json(docs);
});

export const update = ah(async (req, res) => {
  const a = actorOf(req);
  const id = String(req.params.id);
  const before = await prisma.employee.findUnique({ where: { id }, include });
  if (!before) throw notFound('Employee not found');

  // Staff may only change their own phone / address; everything else is HR.
  if (!isAdmin(a)) {
    if (a.employeeId !== id) throw forbidden();
    const d = body(req, selfUpdate);
    const after = await prisma.employee.update({ where: { id }, data: d, include });
    await audit({ actorId: a.userId, action: 'EMPLOYEE_SELF_UPDATE', entity: 'Employee', entityId: id, before: { phone: before.phone, homeAddress: before.homeAddress }, after: d });
    return res.json(toEmployeeDto(after, a));
  }

  const { loginRole, salary, ...d } = body(req, updateEmployee);
  if (d.managerId === id) throw badRequest('An employee cannot manage themself');
  const after = await prisma.$transaction(async (tx) => {
    const e = await tx.employee.update({ where: { id }, data: { ...d, ...(salary !== undefined && { salary }) } });
    if (loginRole && before.userId) {
      await tx.user.update({ where: { id: before.userId }, data: { role: loginRole, tokenVersion: { increment: 1 } } });
      await audit({ actorId: a.userId, action: 'ROLE_CHANGED', entity: 'User', entityId: before.userId, before: { role: before.user?.role }, after: { role: loginRole } }, tx);
    }
    if (d.status === 'inactive' && before.userId) await tx.user.update({ where: { id: before.userId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    if (d.status && d.status !== 'inactive' && before.status === 'inactive' && before.userId) await tx.user.update({ where: { id: before.userId }, data: { isActive: true } });
    await audit({ actorId: a.userId, action: 'EMPLOYEE_UPDATED', entity: 'Employee', entityId: id, before, after: e }, tx);
    return tx.employee.findUniqueOrThrow({ where: { id }, include });
  });
  if (d.status === 'inactive' && before.userId) await revokeAllForUser(before.userId);
  res.json(toEmployeeDto(after, a));
});

/** DELETE = deactivate. Records are retained for payroll/audit; the login is disabled and sessions revoked. */
export const deactivate = ah(async (req, res) => {
  const a = actorOf(req);
  const id = String(req.params.id);
  if (a.employeeId === id) throw badRequest('You cannot deactivate your own account');
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) throw notFound('Employee not found');
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { status: 'inactive' } });
    if (e.userId) await tx.user.update({ where: { id: e.userId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    await audit({ actorId: a.userId, action: 'EMPLOYEE_DEACTIVATED', entity: 'Employee', entityId: id, before: { status: e.status }, after: { status: 'inactive' } }, tx);
  });
  if (e.userId) await revokeAllForUser(e.userId);
  res.json({ ok: true });
});

/** Confidential fields only. Unlike GET /:id (which silently omits them), this fails loudly with ACCESS_RESTRICTED so the client can show the restricted screen. */
export const confidential = ah(async (req, res) => {
  const a = actorOf(req);
  const id = String(req.params.id);
  const e = await prisma.employee.findUnique({ where: { id }, include });
  if (!e) throw notFound('Employee not found');
  await assertCanViewEmployee(a, id);
  const granted = isAdmin(a) || a.employeeId === id ? new Set(['CONTACT', 'COMPENSATION'] as const) : (await activeGrants(a.employeeId, [id])).get(id);
  if (!granted?.size) { await requireScope(a, id, 'CONTACT'); } // throws ACCESS_RESTRICTED + audits the attempt
  if (a.role === 'MANAGER') await audit({ actorId: a.userId, action: 'STAFF_DATA_VIEWED', entity: 'Employee', entityId: id, after: { scopes: [...granted!] } });
  const dto = toEmployeeDto(e, a, granted);
  res.json({ employeeId: id, accessGranted: [...granted!], ...('phone' in dto ? { phone: dto.phone, homeAddress: dto.homeAddress } : {}), ...('salary' in dto ? { salary: dto.salary, currency: dto.currency } : {}) });
});
