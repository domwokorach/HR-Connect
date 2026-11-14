import { z } from 'zod';
import { isIsoDate } from '../lib/dates';

export const isoDate = z.string().refine(isIsoDate, 'Use YYYY-MM-DD');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
export const uuid = z.string().uuid();
export const money = z.coerce.number().min(0).max(100_000_000);
export const optId = z.string().uuid().nullable().optional();
export const dateRange = z.object({ from: isoDate.optional(), to: isoDate.optional() });
