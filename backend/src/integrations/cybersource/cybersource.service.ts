import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CardPaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../services/audit';
import { csRequest, CybersourceError, type CsErrorCategory } from './cybersource.client';
import { loadCybersourceConfig, webhookKey } from './cybersource.config';

/** Provider status → internal status. Unknown provider statuses return null: completion is never inferred, the record is left as it was. */
export function mapProviderStatus(s: string | undefined | null): CardPaymentStatus | null {
  switch ((s ?? '').toUpperCase()) {
    case 'AUTHORIZED': case 'PARTIAL_AUTHORIZED': return 'AUTHORIZED';
    case 'PENDING': case 'PENDING_AUTHENTICATION': case 'ACCEPTED': return 'PENDING';
    case 'AUTHORIZED_PENDING_REVIEW': case 'PENDING_REVIEW': return 'UNDER_REVIEW';
    case 'DECLINED': case 'AUTHORIZED_RISK_DECLINED': case 'INVALID_REQUEST': return 'DECLINED';
    case 'REVERSED': case 'CANCELLED': case 'VOIDED': return 'REVERSED';
    case 'TRANSMITTED': case 'CAPTURED': case 'SETTLED': return 'CAPTURED';
    case 'REFUNDED': return 'REFUNDED';
    case 'SERVER_ERROR': case 'FAILED': return 'FAILED';
    default: return null;
  }
}

// ---- connection status (per-instance memory only; durable copy is the PaymentIntegrationStatus row) ----
export async function connectionStatus() {
  const cfg = loadCybersourceConfig();
  const row = await prisma.paymentIntegrationStatus.findUnique({ where: { id: 1 } });
  const base = { configuredEnvironment: cfg?.env ?? null, configured: !!cfg, webhookKeyConfigured: !!webhookKey(), lastSuccessAt: row?.lastSuccessAt ?? null, lastErrorCategory: row?.lastErrorCategory ?? null };
  if (!cfg) return { ...base, connectivity: 'not_configured' as const, authentication: 'unverified' as const, verifiedProducts: [] as string[] };
  let connectivity: 'ok' | 'error' = 'ok'; let authentication: 'verified' | 'failed' | 'unverified' = 'unverified'; let category: CsErrorCategory | null = null;
  const products: string[] = [];
  try {
    // Read-only probe of the Reporting product: proves signature/auth and that Reporting is enabled. No payment is created.
    await csRequest(cfg, 'GET', '/reporting/v3/report-definitions');
    authentication = 'verified'; products.push('reporting');
  } catch (e) {
    category = e instanceof CybersourceError ? e.category : 'network';
    if (category === 'auth') { authentication = 'failed'; connectivity = 'ok'; }
    else if (category === 'forbidden') { authentication = 'verified'; connectivity = 'ok'; } // authenticated, but product not enabled
    else connectivity = 'error';
  }
  const now = new Date();
  await prisma.paymentIntegrationStatus.upsert({
    where: { id: 1 },
    create: { id: 1, environment: cfg.env, lastSuccessAt: category ? null : now, lastErrorCategory: category, lastCheckedAt: now },
    update: { environment: cfg.env, ...(category ? { lastErrorCategory: category } : { lastSuccessAt: now, lastErrorCategory: null }), lastCheckedAt: now },
  });
  return { ...base, lastSuccessAt: category ? base.lastSuccessAt : now, lastErrorCategory: category ?? null, connectivity, authentication, verifiedProducts: products };
}

// ---- reconciliation ----
interface CsPayment { id?: string; status?: string; reconciliationId?: string }

/** Pulls the transaction from Cybersource (source of truth) and applies it. Safe to repeat. */
export async function reconcileTransaction(transactionId: string, actorId: string | null) {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!tx || !tx.providerReference) return { outcome: 'skipped' as const };
  const cfg = loadCybersourceConfig();
  if (!cfg) return { outcome: 'not_configured' as const };
  let remote: CsPayment;
  try { remote = (await csRequest<CsPayment>(cfg, 'GET', `/pts/v2/payments/${encodeURIComponent(tx.providerReference)}`)).data ?? {}; }
  catch (e) {
    const category = e instanceof CybersourceError ? e.category : 'network';
    await prisma.paymentReconciliation.create({ data: { transactionId, outcome: 'error', errorCategory: category } });
    return { outcome: 'error' as const, category };
  }
  const mapped = mapProviderStatus(remote.status);
  const changed = !!mapped && mapped !== tx.status;
  await prisma.$transaction(async (db) => {
    if (changed) {
      await db.paymentTransaction.update({ where: { id: tx.id }, data: { status: mapped!, providerStatus: remote.status, ...(mapped === 'AUTHORIZED' && !tx.authorizedAt ? { authorizedAt: new Date() } : {}), ...(mapped === 'CAPTURED' && !tx.capturedAt ? { capturedAt: new Date() } : {}) } });
      await audit({ actorId, action: 'payment.reconciled', entity: 'PaymentTransaction', entityId: tx.id, before: { status: tx.status }, after: { status: mapped } }, db);
    } else if (remote.status) await db.paymentTransaction.update({ where: { id: tx.id }, data: { providerStatus: remote.status } });
    await db.paymentReconciliation.create({ data: { transactionId, outcome: changed ? 'updated' : mapped ? 'unchanged' : 'unmapped', providerStatus: remote.status } });
  });
  return { outcome: changed ? ('updated' as const) : ('unchanged' as const), status: mapped ?? tx.status };
}

// ---- webhooks ----
const TOLERANCE_S = 300;

/** `v-c-signature: t=<unix>,s=<base64 HMAC-SHA256 of "<t>.<rawBody>" keyed with the base64-decoded webhook key>`. */
export function verifyWebhookSignature(rawBody: Buffer, header: string | undefined, key: string, nowMs = Date.now()): 'ok' | 'invalid' | 'stale' {
  if (!header) return 'invalid';
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = Number(parts.t); const s = parts.s;
  if (!Number.isFinite(t) || !s) return 'invalid';
  const expected = createHmac('sha256', Buffer.from(key, 'base64')).update(`${parts.t}.`).update(rawBody).digest();
  const given = Buffer.from(s, 'base64');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'invalid';
  return Math.abs(nowMs / 1000 - t) > TOLERANCE_S ? 'stale' : 'ok';
}

export async function handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ status: number; body: object }> {
  const key = webhookKey();
  if (!key) return { status: 503, body: { error: 'Webhook receiver not configured' } };
  const v = verifyWebhookSignature(rawBody, signature, key);
  if (v !== 'ok') return { status: 401, body: { error: 'Invalid signature' } };
  let parsed: Record<string, any>;
  try { parsed = JSON.parse(rawBody.toString('utf8')); } catch { return { status: 400, body: { error: 'Invalid payload' } }; }
  const eventId = String(parsed.notificationId ?? parsed.webhookId ?? createHash('sha256').update(rawBody).digest('hex'));
  const providerReference: string | undefined = parsed.payload?.data?.id ?? parsed.payload?.id ?? undefined;
  try {
    await prisma.paymentEvent.create({ data: { eventId, eventType: String(parsed.eventType ?? 'unknown').slice(0, 120), providerReference, payload: redact(parsed) as Prisma.InputJsonValue } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { status: 200, body: { received: true, duplicate: true } }; // replay / redelivery
    throw e;
  }
  // The notification only says "something changed": the authoritative state is re-fetched, so out-of-order or forged-content events cannot set a status.
  if (providerReference) {
    const tx = await prisma.paymentTransaction.findFirst({ where: { providerReference }, select: { id: true } });
    if (tx) {
      const r = await reconcileTransaction(tx.id, null).catch(() => ({ outcome: 'error' as const }));
      await prisma.paymentEvent.update({ where: { eventId }, data: { processedAt: r.outcome === 'error' ? null : new Date(), transactionId: tx.id } });
    }
  }
  return { status: 200, body: { received: true } };
}

/** Drops anything that looks like card data before an event is persisted. */
function redact(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (k, val) => (/^(number|cardNumber|accountNumber|securityCode|cvv|cvn|expiration.*|bin|suffix)$/i.test(k) ? '[redacted]' : val)));
}

/** Retries events that were stored but not processed (missed/failed handling). Intended for a Vercel Cron call. */
export async function reconcilePending(limit = 25) {
  const stuck = await prisma.paymentTransaction.findMany({ where: { status: { in: ['PENDING', 'AUTHORIZED', 'UNDER_REVIEW'] }, providerReference: { not: null }, updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, orderBy: { updatedAt: 'asc' }, take: limit, select: { id: true } });
  const results = [];
  for (const t of stuck) results.push(await reconcileTransaction(t.id, null));
  return { checked: stuck.length, updated: results.filter((r) => r.outcome === 'updated').length };
}

export async function summary() {
  const [byStatus, volume] = await Promise.all([
    prisma.paymentTransaction.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountMinor: true } }),
    prisma.paymentTransaction.findMany({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, select: { createdAt: true, status: true, amountMinor: true, currency: true } }),
  ]);
  const sum = (st: string) => byStatus.find((b) => b.status === st)?._sum.amountMinor ?? 0;
  const cnt = (st: string) => byStatus.find((b) => b.status === st)?._count._all ?? 0;
  const daily = new Map<string, { date: string; count: number; capturedMinor: number; declined: number; refundedMinor: number }>();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })); // UTC
  for (const t of volume) {
    const d = t.createdAt.toISOString().slice(0, 10);
    const e = daily.get(d) ?? { date: d, count: 0, capturedMinor: 0, declined: 0, refundedMinor: 0 };
    e.count++;
    if (t.status === 'CAPTURED') e.capturedMinor += t.amountMinor;
    if (t.status === 'DECLINED') e.declined++;
    if (t.status === 'REFUNDED') e.refundedMinor += t.amountMinor;
    daily.set(d, e); byHour[t.createdAt.getUTCHours()].count++;
  }
  const lastSync = await prisma.paymentIntegrationStatus.findUnique({ where: { id: 1 } });
  return {
    totals: { count: byStatus.reduce((a, b) => a + b._count._all, 0), volumeMinor: byStatus.reduce((a, b) => a + (b._sum.amountMinor ?? 0), 0), capturedMinor: sum('CAPTURED'), refundedMinor: sum('REFUNDED'), netCapturedMinor: sum('CAPTURED') - sum('REFUNDED') },
    byStatus: byStatus.map((b) => ({ status: b.status, count: b._count._all })),
    counts: { completed: cnt('CAPTURED'), pending: cnt('PENDING') + cnt('AUTHORIZED') + cnt('UNDER_REVIEW'), declined: cnt('DECLINED'), refunded: cnt('REFUNDED') },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byHour,
    currency: volume[0]?.currency ?? null,
    lastSyncAt: lastSync?.lastSuccessAt ?? null,
  };
}
