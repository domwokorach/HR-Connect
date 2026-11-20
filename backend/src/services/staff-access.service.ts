import type { AccessScope, StaffAccessRequest } from '@prisma/client';
import type { Actor } from '../middleware/auth';
import { accessRestricted, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import { requireEmployee } from './access';
import { audit } from './audit';
import { notifyAdmins, notifyEmployee } from './notify';

const DAY = 86_400_000;
export const requestInclude = {
  requester: { select: { id: true, fullName: true, jobTitle: true } },
  subject: { select: { id: true, fullName: true, jobTitle: true } },
} as const;

/** Scopes each manager may currently see for each report. Only an approved, unexpired, unrevoked grant from the person's *current* line manager counts. */
export async function activeGrants(requesterId: string | null, subjectIds?: string[]): Promise<Map<string, Set<AccessScope>>> {
  const out = new Map<string, Set<AccessScope>>();
  if (!requesterId) return out;
  const rows = await prisma.staffAccessRequest.findMany({
    where: { requesterId, status: 'APPROVED', revokedAt: null, startsAt: { lte: new Date() }, endsAt: { gt: new Date() }, subject: { managerId: requesterId }, ...(subjectIds && { subjectId: { in: subjectIds } }) },
    select: { subjectId: true, scopes: true },
  });
  for (const r of rows) { const s = out.get(r.subjectId) ?? new Set<AccessScope>(); r.scopes.forEach((x) => s.add(x)); out.set(r.subjectId, s); }
  return out;
}

export async function createRequest(a: Actor, d: { subjectId: string; scopes: AccessScope[]; businessReason: string; purpose: string; durationDays: number }) {
  if (a.role !== 'MANAGER') throw forbidden('Only line managers can request staff access');
  const me = requireEmployee(a);
  const subject = await prisma.employee.findUnique({ where: { id: d.subjectId }, select: { id: true, managerId: true, fullName: true } });
  if (!subject) throw notFound('Employee not found');
  if (subject.managerId !== me) throw forbidden('You can only request access to your direct reports');
  if (await prisma.staffAccessRequest.findFirst({ where: { requesterId: me, subjectId: d.subjectId, OR: [{ status: { in: ['PENDING_STAFF', 'PENDING_HR'] } }, { status: 'APPROVED', revokedAt: null, endsAt: { gt: new Date() } }] }, select: { id: true } }))
    throw conflict('You already have an open request or active access for this person');
  return prisma.$transaction(async (tx) => {
    const r = await tx.staffAccessRequest.create({ data: { requesterId: me, subjectId: d.subjectId, scopes: d.scopes, businessReason: d.businessReason, purpose: d.purpose, durationDays: d.durationDays }, include: requestInclude });
    await audit({ actorId: a.userId, action: 'ACCESS_REQUESTED', entity: 'StaffAccessRequest', entityId: r.id, after: r }, tx);
    await notifyEmployee(d.subjectId, 'Access request', `Your line manager asked to view your ${d.scopes.join(' / ').toLowerCase()} details. Review and respond.`, 'access', tx);
    return r;
  });
}

async function load(id: string) {
  const r = await prisma.staffAccessRequest.findUnique({ where: { id } });
  if (!r) throw notFound('Request not found');
  return r;
}
/** Move a request between states atomically; the status guard makes concurrent decisions safe. */
async function transition(tx: Tx, r: StaffAccessRequest, from: StaffAccessRequest['status'][], data: Partial<StaffAccessRequest>, action: string, a: Actor) {
  const res = await tx.staffAccessRequest.updateMany({ where: { id: r.id, status: { in: from } }, data });
  if (res.count !== 1) throw conflict('This request has already been decided or changed');
  const after = await tx.staffAccessRequest.findUniqueOrThrow({ where: { id: r.id }, include: requestInclude });
  await audit({ actorId: a.userId, action, entity: 'StaffAccessRequest', entityId: r.id, before: r, after }, tx);
  return after;
}

export async function consent(a: Actor, id: string, approve: boolean, note?: string) {
  const r = await load(id);
  if (r.subjectId !== a.employeeId) throw forbidden('Only the staff member concerned can respond to this request');
  if (r.status !== 'PENDING_STAFF') throw conflict('This request is not awaiting your consent');
  return prisma.$transaction(async (tx) => {
    const after = await transition(tx, r, ['PENDING_STAFF'], { status: approve ? 'PENDING_HR' : 'DECLINED_BY_STAFF', staffNote: note ?? null, staffDecidedAt: new Date() }, approve ? 'ACCESS_CONSENTED' : 'ACCESS_DECLINED', a);
    if (approve) await notifyAdmins('Access request awaiting HR approval', `${after.requester.fullName} → ${after.subject.fullName}: ${after.purpose}`, 'access', tx);
    await notifyEmployee(r.requesterId, approve ? 'Staff consented to access' : 'Staff declined access', approve ? 'Waiting for HR approval.' : note, 'access', tx);
    return after;
  });
}

export async function hrReview(a: Actor, id: string, approve: boolean, note?: string, durationDays?: number, lawfulBasis?: string) {
  const r = await load(id);
  if (a.role !== 'ADMIN') throw forbidden();
  if (a.employeeId && (a.employeeId === r.subjectId || a.employeeId === r.requesterId)) throw forbidden('You cannot review a request you are part of');
  if (r.status !== 'PENDING_HR') throw conflict(r.status === 'PENDING_STAFF' ? 'The staff member has not consented yet' : 'This request is not awaiting HR review');
  if (approve && durationDays && durationDays > r.durationDays) throw badRequest('HR can shorten the requested duration, not extend it');
  const now = new Date();
  const days = durationDays ?? r.durationDays;
  return prisma.$transaction(async (tx) => {
    const after = await transition(tx, r, ['PENDING_HR'], approve
      ? { status: 'APPROVED', hrReviewerId: a.userId, hrNote: note ?? null, hrDecidedAt: now, lawfulBasis: lawfulBasis ?? null, durationDays: days, startsAt: now, endsAt: new Date(now.getTime() + days * DAY) }
      : { status: 'REJECTED_BY_HR', hrReviewerId: a.userId, hrNote: note ?? null, hrDecidedAt: now }, approve ? 'ACCESS_APPROVED' : 'ACCESS_REJECTED', a);
    await notifyEmployee(r.requesterId, approve ? 'Access approved' : 'Access rejected', approve ? `Access to ${after.subject.fullName}'s data is active for ${days} day(s).` : note, 'access', tx);
    await notifyEmployee(r.subjectId, approve ? 'Manager access granted' : 'Access request rejected', approve ? `HR approved your manager's access for ${days} day(s). You can revoke it at any time.` : undefined, 'access', tx);
    return after;
  });
}

export async function cancel(a: Actor, id: string) {
  const r = await load(id);
  if (r.requesterId !== a.employeeId) throw forbidden();
  return prisma.$transaction((tx) => transition(tx, r, ['PENDING_STAFF', 'PENDING_HR'], { status: 'CANCELLED' }, 'ACCESS_CANCELLED', a));
}

/** The staff member or HR can withdraw an active grant immediately. */
export async function revoke(a: Actor, id: string) {
  const r = await load(id);
  if (!(a.role === 'ADMIN' || r.subjectId === a.employeeId)) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const after = await transition(tx, r, ['APPROVED'], { status: 'REVOKED', revokedAt: new Date() }, 'ACCESS_REVOKED', a);
    await notifyEmployee(r.requesterId, 'Access revoked', `Your access to ${after.subject.fullName}'s data was withdrawn.`, 'access', tx);
    return after;
  });
}

/** UI-facing status: an approved grant past its end date reads as EXPIRED even before any sweep touches the row. */
export const effectiveStatus = (r: Pick<StaffAccessRequest, 'status' | 'endsAt'>) => (r.status === 'APPROVED' && r.endsAt && r.endsAt <= new Date() ? 'EXPIRED' : r.status);

export async function list(a: Actor, status?: StaffAccessRequest['status'] | 'EXPIRED') {
  const where = a.role === 'ADMIN' ? {} : a.role === 'MANAGER' ? { requesterId: a.employeeId ?? 'none' } : { subjectId: a.employeeId ?? 'none' };
  const rows = await prisma.staffAccessRequest.findMany({ where: { ...where, ...(status && status !== 'EXPIRED' && { status }) }, include: requestInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  const out = rows.map((r) => ({ ...r, status: effectiveStatus(r) }));
  return status ? out.filter((r) => r.status === status) : out;
}

export type AccessState = 'RESTRICTED' | 'AWAITING_STAFF_CONSENT' | 'AWAITING_HR_APPROVAL' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';
const STATE: Record<string, AccessState> = { PENDING_STAFF: 'AWAITING_STAFF_CONSENT', PENDING_HR: 'AWAITING_HR_APPROVAL', APPROVED: 'APPROVED', DECLINED_BY_STAFF: 'DECLINED', REJECTED_BY_HR: 'DECLINED', EXPIRED: 'EXPIRED', REVOKED: 'REVOKED' };

/** What a manager sees about their access to one report: the latest request's state, or RESTRICTED if none is live. */
export async function accessState(a: Actor, subjectId: string) {
  const me = requireEmployee(a);
  const latest = await prisma.staffAccessRequest.findFirst({ where: { requesterId: me, subjectId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } });
  if (!latest) return { state: 'RESTRICTED' as AccessState, request: null };
  const grants = (await activeGrants(me, [subjectId])).get(subjectId);
  return { state: (grants?.size ? 'APPROVED' : STATE[effectiveStatus(latest)] ?? 'RESTRICTED') as AccessState, request: { id: latest.id, scopes: latest.scopes, endsAt: latest.endsAt } };
}

/** Throws ACCESS_RESTRICTED (and audits the attempt) unless the manager holds a live grant covering `scope`. HR and the person themself always pass. */
export async function requireScope(a: Actor, subjectId: string, scope: AccessScope) {
  if (a.role === 'ADMIN' || a.employeeId === subjectId) return;
  const granted = a.role === 'MANAGER' ? (await activeGrants(a.employeeId, [subjectId])).get(subjectId) : undefined;
  if (granted?.has(scope)) {
    await audit({ actorId: a.userId, action: 'STAFF_DATA_VIEWED', entity: 'Employee', entityId: subjectId, after: { scopes: [scope] } });
    return;
  }
  await audit({ actorId: a.userId, action: 'STAFF_DATA_DENIED', entity: 'Employee', entityId: subjectId, after: { scope } });
  const state = a.role === 'MANAGER' ? (await accessState(a, subjectId).catch(() => null))?.state : undefined;
  throw accessRestricted(state ?? 'RESTRICTED');
}

/** Who requested, approved and viewed what. HR sees all; a manager their own activity; staff everything about themself. */
export async function accessAudit(a: Actor, take = 100) {
  const reqs = await prisma.staffAccessRequest.findMany({ where: a.role === 'ADMIN' ? {} : a.role === 'MANAGER' ? { requesterId: a.employeeId ?? 'none' } : { subjectId: a.employeeId ?? 'none' }, select: { id: true, subjectId: true } });
  const reqIds = reqs.map((r) => r.id);
  const subjectIds = [...new Set(reqs.map((r) => r.subjectId))];
  return prisma.auditLog.findMany({
    where: a.role === 'ADMIN'
      ? { OR: [{ entity: 'StaffAccessRequest' }, { action: { in: ['STAFF_DATA_VIEWED', 'STAFF_DATA_DENIED'] } }] }
      : { OR: [{ entity: 'StaffAccessRequest', entityId: { in: reqIds } }, ...(a.role === 'MANAGER' ? [{ action: { in: ['STAFF_DATA_VIEWED', 'STAFF_DATA_DENIED'] }, actorId: a.userId }] : [{ action: { in: ['STAFF_DATA_VIEWED', 'STAFF_DATA_DENIED'] }, entityId: { in: subjectIds.length ? subjectIds : ['none'] } }])] },
    orderBy: { createdAt: 'desc' }, take,
  });
}
