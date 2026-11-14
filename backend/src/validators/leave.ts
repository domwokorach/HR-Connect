import { z } from 'zod';
import { isoDate } from './common';

export const leaveBody = z.object({ leaveTypeId: z.string().uuid(), startDate: isoDate, endDate: isoDate, reason: z.string().trim().max(500).optional(), documentId: z.string().uuid().optional() })
  .refine((d) => d.endDate >= d.startDate, { message: 'End date is before start date', path: ['endDate'] });
export const reviewBody = z.object({ note: z.string().trim().max(300).optional() });
export const leaveListQuery = z.object({ scope: z.enum(['me', 'all']).default('all'), status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional() });
