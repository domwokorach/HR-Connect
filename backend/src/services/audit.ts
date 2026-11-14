import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';

const strip = (o: unknown) => (o === undefined || o === null ? undefined : JSON.parse(JSON.stringify(o, (k, v) => (k === 'passwordHash' ? undefined : v))));

/** Append-only audit trail for sensitive changes. Pass a transaction client to make it atomic with the change. */
export function audit(a: { actorId?: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown; ip?: string }, tx: Tx | typeof prisma = prisma) {
  return tx.auditLog.create({ data: { actorId: a.actorId ?? null, action: a.action, entity: a.entity, entityId: a.entityId ?? null, before: strip(a.before) as Prisma.InputJsonValue | undefined, after: strip(a.after) as Prisma.InputJsonValue | undefined, ip: a.ip } });
}
