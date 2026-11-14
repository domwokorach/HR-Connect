import { z } from 'zod';
import { password } from './auth';
import { isoDate, money, optId } from './common';

const base = {
  fullName: z.string().trim().min(1).max(120),
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  jobTitle: z.string().trim().max(120).default(''),
  departmentId: optId, managerId: optId, scheduleId: optId,
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'),
  startDate: isoDate,
  status: z.enum(['active', 'inactive', 'on_leave']).default('active'),
  country: z.string().length(2).transform((s) => s.toUpperCase()).default('GB'),
  phone: z.string().max(40).nullable().optional(),
  homeAddress: z.string().max(400).nullable().optional(),
  salary: money.optional(),
};
export const createEmployee = z.object({ ...base, login: z.object({ password, role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('STAFF') }).optional() });
export const updateEmployee = z.object({ ...base, loginRole: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional() }).partial();
export const selfUpdate = z.object({ phone: base.phone, homeAddress: base.homeAddress }).strict();
export const listQuery = z.object({ q: z.string().max(100).optional(), departmentId: z.string().uuid().optional(), managerId: z.string().uuid().optional(), status: z.enum(['active', 'inactive', 'on_leave']).optional() });
