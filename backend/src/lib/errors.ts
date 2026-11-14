import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const badRequest = (m: string) => new HttpError(400, m, 'BAD_REQUEST');
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new HttpError(409, m, 'CONFLICT');

export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };
