import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { verifyAccess } from '../services/tokens';

export interface Actor { userId: string; role: Role; employeeId: string | null; email: string }
declare module 'express-serve-static-core' { interface Request { actor?: Actor } }

/** Verifies the bearer token, then loads the user: role/active state always come from the database, never from the client. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized();
    const claims = verifyAccess(h.slice(7));
    const user = await prisma.user.findUnique({ where: { id: claims.sub }, include: { employee: { select: { id: true } } } });
    if (!user || !user.isActive || user.tokenVersion !== claims.tv) throw unauthorized('Session no longer valid');
    req.actor = { userId: user.id, role: user.role, employeeId: user.employee?.id ?? null, email: user.email };
    next();
  } catch (e) { next(e); }
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.actor) return next(unauthorized());
  if (!roles.includes(req.actor.role)) return next(forbidden());
  next();
};

export const actorOf = (req: Request): Actor => { if (!req.actor) throw unauthorized(); return req.actor; };
