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
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}
export const config = parsed.data;
if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
  console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
  process.exit(1);
}
export const isProd = config.NODE_ENV === 'production';
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
