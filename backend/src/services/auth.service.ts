import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { User } from '@prisma/client';
import { config } from '../config';
import { HttpError, badRequest, conflict, notFound, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { audit } from './audit';
import { sendMail } from './mailer';
import { issueRefresh, revokeAllForUser, sha256, signAccess } from './tokens';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Pre-computed so unknown emails cost the same as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id });

export const publicUser = (u: User & { employee?: { id: string; fullName: string } | null }) => ({
  id: u.id, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword,
  employeeId: u.employee?.id ?? null, fullName: u.employee?.fullName ?? u.email,
});

export async function login(email: string, password: string, userAgent?: string, remember = true) {
  const user = await prisma.user.findUnique({ where: { email }, include: { employee: { select: { id: true, fullName: true } } } });
  if (!user) { await argon2.verify(await DUMMY_HASH, password).catch(() => false); throw unauthorized('Invalid email or password'); }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, 'Too many failed attempts. Try again later.', 'LOCKED');
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok || !user.isActive) {
    if (!ok) {
      const fails = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLogins: fails } });
    }
    throw unauthorized('Invalid email or password');
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const refresh = await issueRefresh(user.id, userAgent, remember);
  return { user: publicUser(user), accessToken: signAccess(user), refreshToken: refresh.token, persistent: remember };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return; // identical response either way
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60000) } });
  await sendMail(email, 'Reset your HR Connect password', `Use this link within 30 minutes:\n${config.APP_URL}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this email.`);
}

export async function resetPassword(token: string, newPassword: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
  const hash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: hash, failedLogins: 0, lockedUntil: null, mustChangePassword: false, tokenVersion: { increment: 1 } } });
    await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: row.userId, action: 'PASSWORD_RESET', entity: 'User', entityId: row.userId }, tx);
  });
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await argon2.verify(user.passwordHash, current).catch(() => false))) throw badRequest('Current password is incorrect');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, tokenVersion: { increment: 1 } } });
  await revokeAllForUser(userId);
  await audit({ actorId: userId, action: 'PASSWORD_CHANGE', entity: 'User', entityId: userId });
}

/** Admin-only: give an existing employee a login. */
export async function registerUser(actorId: string, d: { employeeId: string; password: string; role: 'ADMIN' | 'MANAGER' | 'STAFF'; mustChangePassword: boolean }) {
  const emp = await prisma.employee.findUnique({ where: { id: d.employeeId } });
  if (!emp) throw notFound('Employee not found');
  if (emp.userId) throw conflict('This employee already has a login');
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: emp.email.toLowerCase(), passwordHash: await hashPassword(d.password), role: d.role, mustChangePassword: d.mustChangePassword } });
    await tx.employee.update({ where: { id: emp.id }, data: { userId: u.id } });
    await audit({ actorId, action: 'USER_REGISTERED', entity: 'User', entityId: u.id, after: { email: u.email, role: u.role } }, tx);
    return u;
  });
  return { id: user.id, email: user.email, role: user.role };
}
