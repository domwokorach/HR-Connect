import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isProd } from '../config';
import { HttpError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) { res.status(404).json({ error: 'Not found' }); }

/** One JSON line per failure, so a 500 can be traced from the log without the client ever seeing internals. */
function logFailure(err: unknown, req: Request, status: number, code: string) {
  const e = err as { name?: string; message?: string; code?: string; meta?: unknown; stack?: string };
  console.error(JSON.stringify({
    level: 'error', at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], status, code,
    user: (req as { user?: { id?: string } }).user?.id, errorName: e?.name, prismaCode: e?.code, meta: e?.meta,
    message: (e?.message ?? String(err)).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300),
    ...(isProd ? {} : { stack: e?.stack?.split('\n').slice(0, 6) }),
  }));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That record already exists', code: 'CONFLICT' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    // P2021/P2022: the database is behind the Prisma schema (a migration has not been applied)
    if (err.code === 'P2021' || err.code === 'P2022') {
      logFailure(err, req, 503, 'SCHEMA_OUT_OF_DATE');
      return res.status(503).json({ error: 'The database needs to be updated. Please contact your administrator.', code: 'SCHEMA_OUT_OF_DATE', ...(isProd ? {} : { hint: 'Run `npm run db:deploy` in backend/ to apply pending migrations.' }) });
    }
    if (err.code === 'P2003') return res.status(409).json({ error: 'Related record is missing or in use', code: 'CONFLICT' });
  }
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err instanceof Prisma.PrismaClientInitializationError) {
    logFailure(err, req, 503, 'DATABASE_UNAVAILABLE');
    return res.status(503).json({ error: 'The database is currently unreachable. Please try again shortly.', code: 'DATABASE_UNAVAILABLE' });
  }
  if (process.env.NODE_ENV !== 'test') logFailure(err, req, 500, 'INTERNAL');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' }); // never leak internals
}
