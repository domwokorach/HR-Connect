import { ah, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import { requireEmployee } from '../services/access';
import { audit } from '../services/audit';
import { notifyEmployee } from '../services/notify';
import { auditQuery, deviceBody, deviceDecision, networkBody, networkPatch, policyBody, remoteBody } from '../validators/workplace';

const id = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const listNetworks = ah(async (_req, res) => res.json(await prisma.networkPolicy.findMany({ orderBy: { createdAt: 'asc' } })));
export const createNetwork = ah(async (req, res) => {
  const row = await prisma.networkPolicy.create({ data: body(req, networkBody) });
  await audit({ actorId: actorOf(req).userId, action: 'NETWORK_POLICY_CREATED', entity: 'NetworkPolicy', entityId: row.id, after: row });
  res.status(201).json(row);
});
export const updateNetwork = ah(async (req, res) => {
  const before = await prisma.networkPolicy.findUnique({ where: { id: id(req) } });
  if (!before) throw notFound();
  const row = await prisma.networkPolicy.update({ where: { id: before.id }, data: body(req, networkPatch) });
  await audit({ actorId: actorOf(req).userId, action: 'NETWORK_POLICY_UPDATED', entity: 'NetworkPolicy', entityId: row.id, before, after: row });
  res.json(row);
});
export const deleteNetwork = ah(async (req, res) => {
  const before = await prisma.networkPolicy.findUnique({ where: { id: id(req) } });
  if (!before) throw notFound();
  await prisma.networkPolicy.delete({ where: { id: before.id } });
  await audit({ actorId: actorOf(req).userId, action: 'NETWORK_POLICY_DELETED', entity: 'NetworkPolicy', entityId: before.id, before });
  res.status(204).end();
});

export const getPolicy = ah(async (_req, res) => {
  const s = await prisma.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} });
  res.json({ checkIntervalMinutes: s.checkIntervalMinutes });
});
export const setPolicy = ah(async (req, res) => {
  const d = body(req, policyBody);
  const s = await prisma.companySettings.upsert({ where: { id: 1 }, update: d, create: d });
  await audit({ actorId: actorOf(req).userId, action: 'CHECK_INTERVAL_CHANGED', entity: 'CompanySettings', entityId: '1', after: d });
  res.json({ checkIntervalMinutes: s.checkIntervalMinutes });
});

/** Own devices for everyone; HR sees every device. */
export const listDevices = ah(async (req, res) => {
  const a = actorOf(req);
  const where = a.role === 'ADMIN' ? {} : { employeeId: a.employeeId ?? 'none' };
  res.json(await prisma.trustedDevice.findMany({ where, include: { employee: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }));
});
/** Registering never grants trust: it creates a pending device that HR must approve. Re-registering is idempotent. */
export const registerDevice = ah(async (req, res) => {
  const a = actorOf(req);
  const employeeId = requireEmployee(a);
  const d = body(req, deviceBody);
  const row = await prisma.trustedDevice.upsert({ where: { employeeId_deviceId: { employeeId, deviceId: d.deviceId } }, update: { label: d.label, platform: d.platform, lastSeenAt: new Date() }, create: { employeeId, ...d, lastSeenAt: new Date() } });
  if (row.createdAt.getTime() > Date.now() - 2000) await audit({ actorId: a.userId, action: 'DEVICE_REGISTERED', entity: 'TrustedDevice', entityId: row.id, after: { label: row.label } });
  res.status(201).json(row);
});
export const decideDevice = ah(async (req, res) => {
  const row = await prisma.trustedDevice.findUnique({ where: { id: id(req) } });
  if (!row) throw notFound();
  const d = body(req, deviceDecision);
  const updated = await prisma.trustedDevice.update({ where: { id: row.id }, data: { status: d.status } });
  await audit({ actorId: actorOf(req).userId, action: `DEVICE_${d.status.toUpperCase()}`, entity: 'TrustedDevice', entityId: row.id, before: { status: row.status }, after: { status: d.status } });
  await notifyEmployee(row.employeeId, `Device ${d.status === 'trusted' ? 'approved' : 'revoked'}`, row.label, 'attendance');
  res.json(updated);
});
export const removeOwnDevice = ah(async (req, res) => {
  const a = actorOf(req);
  const row = await prisma.trustedDevice.findUnique({ where: { id: id(req) } });
  if (!row) throw notFound();
  if (a.role !== 'ADMIN' && row.employeeId !== a.employeeId) throw forbidden();
  await prisma.trustedDevice.delete({ where: { id: row.id } });
  await audit({ actorId: a.userId, action: 'DEVICE_REMOVED', entity: 'TrustedDevice', entityId: row.id });
  res.status(204).end();
});

export const setRemote = ah(async (req, res) => {
  const { approved } = body(req, remoteBody);
  const emp = await prisma.employee.findUnique({ where: { id: id(req) }, select: { id: true, remoteApproved: true } });
  if (!emp) throw notFound('Employee not found');
  await prisma.employee.update({ where: { id: emp.id }, data: { remoteApproved: approved } });
  await audit({ actorId: actorOf(req).userId, action: 'REMOTE_WORK_CHANGED', entity: 'Employee', entityId: emp.id, before: { remoteApproved: emp.remoteApproved }, after: { remoteApproved: approved } });
  await notifyEmployee(emp.id, approved ? 'Remote work approved' : 'Remote work arrangement ended', undefined, 'attendance');
  res.json({ employeeId: emp.id, remoteApproved: approved });
});

export const auditLogs = ah(async (req, res) => {
  const q = query(req, auditQuery);
  res.json(await prisma.auditLog.findMany({ where: { ...(q.entity && { entity: q.entity }), ...(q.actorId && { actorId: q.actorId }) }, orderBy: { createdAt: 'desc' }, take: q.take }));
});
