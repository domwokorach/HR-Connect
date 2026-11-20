import { z } from 'zod';
import { isValidRule } from '../lib/workplace';

export const networkBody = z.object({
  name: z.string().trim().min(2).max(80),
  cidr: z.string().trim().refine(isValidRule, 'Use an IP address or CIDR range, e.g. 203.0.113.0/24'),
  isActive: z.boolean().default(true),
});
export const networkPatch = networkBody.partial();
export const deviceBody = z.object({ deviceId: z.string().trim().min(8).max(128), label: z.string().trim().min(2).max(80), platform: z.string().trim().max(40).optional() });
export const deviceDecision = z.object({ status: z.enum(['trusted', 'revoked']) });
export const remoteBody = z.object({ approved: z.boolean() });
export const policyBody = z.object({ checkIntervalMinutes: z.number().int().min(15).max(480) });
export const auditQuery = z.object({ entity: z.string().max(60).optional(), actorId: z.string().uuid().optional(), take: z.coerce.number().int().min(1).max(500).default(100) });
