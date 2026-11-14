import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { unauthorized } from '../lib/errors';

export interface AccessClaims { sub: string; role: Role; type: 'access'; tv: number; iat: number; exp: number }
interface RefreshClaims { sub: string; type: 'refresh'; fam: string; jti: string }

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function signAccess(user: { id: string; role: Role; tokenVersion: number }) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access', tv: user.tokenVersion }, config.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
}

export function verifyAccess(token: string): AccessClaims {
  try {
    const c = jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessClaims;
    if (c.type !== 'access') throw new Error('wrong type');
    return c;
  } catch (e) {
    throw unauthorized(e instanceof jwt.TokenExpiredError ? 'Access token expired' : 'Invalid access token');
  }
}

const ttlDays = (persistent: boolean) => (persistent ? config.REFRESH_TOKEN_TTL_DAYS : 1);
/** A just-rotated refresh token may be retried for this long without being treated as stolen. */
const REUSE_GRACE_MS = 10_000;
const refreshExpiry = (persistent: boolean) => new Date(Date.now() + ttlDays(persistent) * 86400_000);

async function mint(userId: string, familyId: string, userAgent?: string, persistent = true) {
  const id = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, type: 'refresh', fam: familyId, jti: id } satisfies RefreshClaims, config.JWT_REFRESH_SECRET, {
    algorithm: 'HS256', expiresIn: `${ttlDays(persistent)}d`,
  });
  await prisma.refreshToken.create({ data: { id, userId, familyId, tokenHash: sha256(token), expiresAt: refreshExpiry(persistent), userAgent: userAgent?.slice(0, 200), persistent } });
  return { token, id };
}

export const issueRefresh = (userId: string, userAgent?: string, persistent = true) => mint(userId, crypto.randomUUID(), userAgent, persistent);

/** Rotate: the presented token is revoked and a new one in the same family is issued. Reuse of a revoked token revokes the whole family. */
export async function rotateRefresh(presented: string, userAgent?: string) {
  let claims: RefreshClaims;
  try { claims = jwt.verify(presented, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as RefreshClaims; } catch { throw unauthorized('Session expired'); }
  if (claims.type !== 'refresh') throw unauthorized('Session expired');
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presented) }, include: { user: true } });
  if (!row) throw unauthorized('Session expired');
  if (row.revokedAt) {
    // Lost-response tolerance: if the client's previous refresh succeeded on the server but the response never arrived
    // (navigation abort, flaky network, two tabs racing), it retries with the token we just rotated. Within a few seconds
    // that is benign — issue a fresh token in the same family. Replays after the grace window are treated as theft.
    const recent = row.replacedBy && Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS && row.expiresAt > new Date() && row.user.isActive;
    if (recent) {
      const next = await mint(row.userId, row.familyId, userAgent, row.persistent);
      return { user: row.user, refreshToken: next.token, persistent: row.persistent };
    }
    await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized('Session expired');
  }
  if (row.expiresAt < new Date() || !row.user.isActive) throw unauthorized('Session expired');
  const next = await mint(row.userId, row.familyId, userAgent, row.persistent);
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedBy: next.id } });
  return { user: row.user, refreshToken: next.token, persistent: row.persistent };
}

export async function revokeRefresh(presented: string | undefined) {
  if (!presented) return;
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presented) } });
  if (row) await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export const revokeAllForUser = (userId: string) => prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

// Short-lived signed links so mobile/browsers can open an uploaded file without sending the Authorization header.
export const signFileToken = (fileId: string) => jwt.sign({ type: 'file', fid: fileId }, config.JWT_ACCESS_SECRET, { expiresIn: '2m' });
export function verifyFileToken(t: string): string {
  try { const c = jwt.verify(t, config.JWT_ACCESS_SECRET) as { type: string; fid: string }; if (c.type !== 'file') throw new Error(); return c.fid; } catch { throw unauthorized('Link expired'); }
}
