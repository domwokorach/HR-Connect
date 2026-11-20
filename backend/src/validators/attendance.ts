import { z } from 'zod';
import { hhmm, isoDate } from './common';

export const deviceId = z.string().trim().min(8).max(128).optional();
export const clockInBody = z.object({ location: z.enum(['office', 'remote']), deviceId });
export const eventBody = z.object({ deviceId });
export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), employeeId: z.string().uuid().optional() });
export const weeklyQuery = z.object({ weekStart: isoDate.optional(), scope: z.enum(['me', 'team']).default('me') });
export const correctionBody = z.object({ workDate: isoDate, clockIn: hhmm, clockOut: hhmm, location: z.enum(['office', 'remote']), reason: z.string().trim().min(3).max(300) })
  .refine((d) => d.clockOut > d.clockIn, { message: 'Clock-out must be after clock-in', path: ['clockOut'] });
export const decisionBody = z.object({ approve: z.boolean() });
export const closeDayBody = z.object({ date: isoDate.optional() });
export const eventsQuery = z.object({ date: isoDate, employeeId: z.string().uuid().optional() });
export const verificationDecisionBody = z.object({ decision: z.enum(['approve', 'reject']) });
