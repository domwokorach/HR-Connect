import { z } from 'zod';
import { connectionStatus, reconcilePending, reconcileTransaction, summary } from '../integrations/cybersource/cybersource.service';
import { ah, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { audit } from '../services/audit';
import { query } from '../middleware/validate';

const listQ = z.object({ status: z.enum(['PENDING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'REVERSED', 'REFUNDED', 'UNDER_REVIEW']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() });

export const status = ah(async (req, res) => {
  const out = await connectionStatus();
  await audit({ actorId: actorOf(req).userId, action: 'payment.connection_checked', entity: 'PaymentIntegration', ip: req.ip });
  res.json(out);
});

export const list = ah(async (req, res) => {
  const q = query(req, listQ);
  const rows = await prisma.paymentTransaction.findMany({
    where: q.status ? { status: q.status } : undefined, take: q.limit + 1, orderBy: { createdAt: 'desc' },
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: { id: true, providerReference: true, amountMinor: true, currency: true, status: true, providerStatus: true, businessRefType: true, businessRefId: true, authorizedAt: true, capturedAt: true, createdAt: true, updatedAt: true },
  });
  const more = rows.length > q.limit;
  res.json({ items: more ? rows.slice(0, -1) : rows, nextCursor: more ? rows[q.limit - 1].id : null });
});

export const stats = ah(async (_req, res) => { res.json(await summary()); });

export const reconcile = ah(async (req, res) => {
  const id = String(req.params.id);
  if (!(await prisma.paymentTransaction.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Transaction not found');
  res.json(await reconcileTransaction(id, actorOf(req).userId));
});

/** Sweep for Vercel Cron: authorised by CRON_SECRET (Vercel sends it as a bearer token), not by a user session. */
export const sweep = ah(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(await reconcilePending());
});
