import { z } from 'zod';

const ENDPOINTS = { sandbox: 'https://apitest.cybersource.com', production: 'https://api.cybersource.com' } as const;

const schema = z.object({
  CYBERSOURCE_ORG_ID: z.string().min(1).optional(),
  CYBERSOURCE_KEY_ID: z.string().min(1).optional(),
  CYBERSOURCE_SHARED_SECRET: z.string().min(1).optional(),
  CYBERSOURCE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  CYBERSOURCE_API_BASE_URL: z.string().url().optional(),
  CYBERSOURCE_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional(),
  CYBERSOURCE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(25000).default(10000),
});

export interface CybersourceConfig {
  env: 'sandbox' | 'production';
  baseUrl: string;
  orgId: string;
  keyId: string;
  sharedSecret: string;
  timeoutMs: number;
}

/** Credentials are read per call (never cached at import) so a rotated Vercel secret takes effect on the next deploy and tests can set them. */
export function loadCybersourceConfig(env: NodeJS.ProcessEnv = process.env): CybersourceConfig | null {
  const p = schema.safeParse(env);
  if (!p.success) return null;
  const c = p.data;
  if (!c.CYBERSOURCE_ORG_ID || !c.CYBERSOURCE_KEY_ID || !c.CYBERSOURCE_SHARED_SECRET) return null;
  const baseUrl = c.CYBERSOURCE_API_BASE_URL ?? ENDPOINTS[c.CYBERSOURCE_ENV];
  // Never let sandbox credentials reach the live host (or vice versa) through a stray base-URL override.
  if (c.CYBERSOURCE_ENV === 'sandbox' && baseUrl !== ENDPOINTS.sandbox) return null;
  if (c.CYBERSOURCE_ENV === 'production' && !baseUrl.startsWith('https://') ) return null;
  return { env: c.CYBERSOURCE_ENV, baseUrl, orgId: c.CYBERSOURCE_ORG_ID, keyId: c.CYBERSOURCE_KEY_ID, sharedSecret: c.CYBERSOURCE_SHARED_SECRET, timeoutMs: c.CYBERSOURCE_TIMEOUT_MS };
}

export const webhookKey = (env: NodeJS.ProcessEnv = process.env) => env.CYBERSOURCE_WEBHOOK_SIGNATURE_KEY || null;
