import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isProd } from '../config';
import { HttpError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) { res.status(404).json({ error: 'Not found' }); }

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That record already exists', code: 'CONFLICT' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (err.code === 'P2003') return res.status(409).json({ error: 'Related record is missing or in use', code: 'CONFLICT' });
  }
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (!isProd || process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: 'Internal server error' }); // never leak internals
}
