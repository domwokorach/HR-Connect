import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(14),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  APP_URL: z.string().default('http://localhost:8081'),
  UPLOAD_DIR: z.string().default('uploads'),
});

const parsed = schema.safeParse(process.env);
/** Names of invalid/missing settings (never their values). Non-empty means /api is refused with 503; `/` and `/health` stay up so a misconfigured deploy is diagnosable. */
export const configErrors: string[] = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
if (!parsed.success) console.error('Invalid environment configuration: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
else if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
  configErrors.push('JWT_REFRESH_SECRET');
  console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
}
export const config = parsed.success ? parsed.data : schema.parse({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'unset', JWT_ACCESS_SECRET: 'x'.repeat(32), JWT_REFRESH_SECRET: 'y'.repeat(32) });
export const isProd = config.NODE_ENV === 'production';
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
