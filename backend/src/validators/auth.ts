import { z } from 'zod';

export const password = z.string().min(10, 'Password must be at least 10 characters').max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter').regex(/[A-Z]/, 'Password needs an uppercase letter').regex(/\d/, 'Password needs a digit');

export const loginBody = z.object({ email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()), password: z.string().min(1).max(128), remember: z.boolean().default(true) });
export const refreshBody = z.object({ refreshToken: z.string().optional() });
export const forgotBody = z.object({ email: z.string().email().transform((s) => s.trim().toLowerCase()) });
export const resetBody = z.object({ token: z.string().min(20), password });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const registerBody = z.object({
  employeeId: z.string().uuid(), password, role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('STAFF'), mustChangePassword: z.boolean().default(true),
});
