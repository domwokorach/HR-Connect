import { z } from 'zod';
import { isoDate, money } from './common';

export const processBody = z.object({ month: isoDate });
export const bonusBody = z.object({ bonus: money });
export const ruleBody = z.object({ name: z.string().trim().min(1).max(100), country: z.string().length(2).transform((s) => s.toUpperCase()), employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).nullable().optional(), kind: z.enum(['percent_of_gross', 'fixed']), value: z.coerce.number().min(0).max(1_000_000), active: z.boolean().default(true) });

export const jobBody = z.object({ title: z.string().trim().min(1).max(120), departmentId: z.string().uuid().nullable().optional(), location: z.string().max(120).nullable().optional(), employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'), description: z.string().max(4000).nullable().optional(), status: z.enum(['draft', 'open', 'closed']).default('open') });
export const applicationBody = z.object({ jobId: z.string().uuid(), fullName: z.string().trim().min(1).max(120), email: z.string().email().transform((s) => s.toLowerCase()), phone: z.string().max(40).nullable().optional(), resumeId: z.string().uuid().nullable().optional() });
export const applicationPatch = z.object({ status: z.enum(['applied', 'screening', 'interview', 'offered', 'rejected']).optional(), rating: z.number().int().min(1).max(5).nullable().optional(), evaluation: z.string().max(2000).nullable().optional(), offerSalary: money.nullable().optional(), offerNotes: z.string().max(1000).nullable().optional(), hiringApproved: z.boolean().optional() });
export const interviewBody = z.object({ scheduledAt: z.coerce.date(), interviewerId: z.string().uuid().nullable().optional(), mode: z.enum(['video', 'phone', 'onsite']).default('video'), notes: z.string().max(500).nullable().optional() });
export const interviewEval = z.object({ score: z.number().int().min(1).max(5), feedback: z.string().max(2000).optional() });
export const hireBody = z.object({ startDate: isoDate, managerId: z.string().uuid().nullable().optional() });

export const courseBody = z.object({ title: z.string().trim().min(1).max(120), description: z.string().max(1000).nullable().optional(), durationHours: z.coerce.number().positive().max(500).default(1) });
export const assignBody = z.object({ trainingId: z.string().uuid(), employeeId: z.string().uuid(), dueDate: isoDate });
export const progressBody = z.object({ progress: z.number().int().min(0).max(100) });

export const benefitBody = z.object({ name: z.string().trim().min(1).max(100), category: z.enum(['health', 'pension', 'transport', 'meal', 'wellness', 'other']), description: z.string().max(500).nullable().optional(), monthlyCost: money, isAllowance: z.boolean().default(false), eligibility: z.string().max(200).default('All active employees') });
export const enrolBody = z.object({ employeeId: z.string().uuid(), benefitId: z.string().uuid(), monthlyCost: money.optional() });
export const enrolPatch = z.object({ status: z.enum(['pending', 'enrolled', 'ended']) });
