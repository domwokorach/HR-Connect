import type { Request } from 'express';
import { ZodError, type ZodTypeAny, z } from 'zod';
import { badRequest } from '../lib/errors';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  try { return schema.parse(data); } catch (e) {
    if (e instanceof ZodError) throw badRequest(e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    throw e;
  }
}
export const body = <S extends ZodTypeAny>(req: Request, s: S): z.infer<S> => parse(s, req.body ?? {});
export const query = <S extends ZodTypeAny>(req: Request, s: S): z.infer<S> => parse(s, req.query);
