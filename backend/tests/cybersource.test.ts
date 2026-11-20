import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csRequest, CybersourceError, signRequest } from '../src/integrations/cybersource/cybersource.client';
import { loadCybersourceConfig } from '../src/integrations/cybersource/cybersource.config';
import { mapProviderStatus, verifyWebhookSignature } from '../src/integrations/cybersource/cybersource.service';
import { prisma } from '../src/lib/prisma';
import { app, authed, login, resetDb, seedBasic } from './helpers';

const SECRET = Buffer.from('test-shared-secret-32-bytes-long!').toString('base64');
const cfg = { env: 'sandbox' as const, baseUrl: 'https://apitest.cybersource.com', orgId: 'org_test', keyId: 'key_test', sharedSecret: SECRET, timeoutMs: 2000 };

describe('config', () => {
  it('is null without credentials and refuses a sandbox env pointed at a non-sandbox host', () => {
    expect(loadCybersourceConfig({})).toBeNull();
    const base = { CYBERSOURCE_ORG_ID: 'o', CYBERSOURCE_KEY_ID: 'k', CYBERSOURCE_SHARED_SECRET: SECRET };
    expect(loadCybersourceConfig({ ...base, CYBERSOURCE_ENV: 'sandbox' })?.baseUrl).toBe('https://apitest.cybersource.com');
    expect(loadCybersourceConfig({ ...base, CYBERSOURCE_ENV: 'sandbox', CYBERSOURCE_API_BASE_URL: 'https://api.cybersource.com' })).toBeNull();
  });
});

describe('request signing', () => {
  it('produces a verifiable HmacSHA256 signature over the documented string, with a body digest only on POST', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const h = signRequest(cfg, 'POST', '/pts/v2/payments', '{"a":1}', date);
    expect(h.Digest).toMatch(/^SHA-256=/);
    const expectedString = `host: apitest.cybersource.com\ndate: ${date.toUTCString()}\n(request-target): post /pts/v2/payments\ndigest: ${h.Digest}\nv-c-merchant-id: org_test`;
    const sig = createHmac('sha256', Buffer.from(SECRET, 'base64')).update(expectedString).digest('base64');
    expect(h.Signature).toContain(`signature="${sig}"`);
    expect(h.Signature).toContain('headers="host date (request-target) digest v-c-merchant-id"');
    const g = signRequest(cfg, 'GET', '/reporting/v3/report-definitions', undefined, date);
    expect(g.Digest).toBeUndefined();
    expect(g.Signature).toContain('headers="host date (request-target) v-c-merchant-id"');
  });
  it('never leaks the secret in headers', () => {
    expect(JSON.stringify(signRequest(cfg, 'GET', '/x', undefined))).not.toContain(SECRET);
  });
});

describe('client error handling', () => {
  const res = (status: number) => (async () => new Response('{"message":"secret detail"}', { status })) as unknown as typeof fetch;
  it('categorises auth failures without exposing provider detail', async () => {
    const e = await csRequest(cfg, 'GET', '/x', undefined, res(401)).catch((x) => x);
    expect(e).toBeInstanceOf(CybersourceError);
    expect(e.category).toBe('auth');
    expect(e.message).not.toContain('secret detail');
  });
  it('retries a GET once on 5xx but never retries a POST', async () => {
    let n = 0; const f = (async () => { n++; return new Response('{}', { status: 503 }); }) as unknown as typeof fetch;
    await csRequest(cfg, 'GET', '/x', undefined, f).catch(() => 0); expect(n).toBe(2);
    n = 0; await csRequest(cfg, 'POST', '/x', {}, f).catch(() => 0); expect(n).toBe(1);
  });
  it('times out', async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const e = await csRequest({ ...cfg, timeoutMs: 1000 }, 'POST', '/x', {}, slow).catch((x) => x);
    expect(e.category).toBe('timeout');
  });
});

describe('status mapping', () => {
  it('maps known provider statuses and refuses to guess unknown ones', () => {
    expect(mapProviderStatus('AUTHORIZED')).toBe('AUTHORIZED');
    expect(mapProviderStatus('DECLINED')).toBe('DECLINED');
    expect(mapProviderStatus('AUTHORIZED_PENDING_REVIEW')).toBe('UNDER_REVIEW');
    expect(mapProviderStatus('SOMETHING_NEW')).toBeNull();
    expect(mapProviderStatus(undefined)).toBeNull();
  });
});

describe('webhook signature', () => {
  const KEY = Buffer.from('webhook-key-webhook-key-webhook!').toString('base64');
  const body = Buffer.from('{"notificationId":"n1"}');
  const sign = (t: number, b = body) => `t=${t},s=${createHmac('sha256', Buffer.from(KEY, 'base64')).update(`${t}.`).update(b).digest('base64')}`;
  const now = 1_800_000_000_000;
  it('accepts valid, rejects tampered body, wrong key, missing header and stale timestamps', () => {
    expect(verifyWebhookSignature(body, sign(now / 1000), KEY, now)).toBe('ok');
    expect(verifyWebhookSignature(Buffer.from('{"notificationId":"n2"}'), sign(now / 1000), KEY, now)).toBe('invalid');
    expect(verifyWebhookSignature(body, sign(now / 1000), Buffer.from('other-other-other-other-other-ot').toString('base64'), now)).toBe('invalid');
    expect(verifyWebhookSignature(body, undefined, KEY, now)).toBe('invalid');
    expect(verifyWebhookSignature(body, sign(now / 1000 - 600), KEY, now)).toBe('stale');
  });
});

describe('payments API (no Cybersource credentials configured)', () => {
  let ids: Awaited<ReturnType<typeof seedBasic>>;
  beforeAll(async () => { await resetDb(); ids = await seedBasic(); });
  beforeEach(async () => { await prisma.paymentEvent.deleteMany(); await prisma.paymentTransaction.deleteMany(); });
  afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

  it('rejects unauthenticated, STAFF and MANAGER; allows ADMIN', async () => {
    expect((await request(app).get('/api/payments/summary')).status).toBe(401);
    for (const k of ['staff', 'manager']) {
      const { token } = await login(k); expect((await request(app).get('/api/payments/summary').set(authed(token))).status).toBe(403);
    }
    const { token } = await login('admin');
    const r = await request(app).get('/api/payments/summary').set(authed(token));
    expect(r.status).toBe(200); expect(r.body.totals.count).toBe(0);
    void ids;
  });
  it('reports not_configured honestly instead of faking connectivity', async () => {
    const { token } = await login('admin');
    const r = await request(app).get('/api/payments/status').set(authed(token));
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ configured: false, connectivity: 'not_configured', authentication: 'unverified', verifiedProducts: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/secret|keyId/i);
  });
  it('webhook: 503 when unconfigured, 401 on bad signature, dedupes redelivery', async () => {
    expect((await request(app).post('/api/webhooks/cybersource').send({})).status).toBe(503);
    const KEY = Buffer.from('webhook-key-webhook-key-webhook!').toString('base64');
    process.env.CYBERSOURCE_WEBHOOK_SIGNATURE_KEY = KEY;
    try {
      const body = JSON.stringify({ notificationId: 'evt_1', eventType: 'x', payload: { data: { id: 'unknown-ref', card: { number: '4111111111111111' } } } });
      const t = Math.floor(Date.now() / 1000);
      const sig = `t=${t},s=${createHmac('sha256', Buffer.from(KEY, 'base64')).update(`${t}.${body}`).digest('base64')}`;
      const post = (s: string) => request(app).post('/api/webhooks/cybersource').set('Content-Type', 'application/json').set('v-c-signature', s).send(body);
      expect((await post('t=1,s=AAAA')).status).toBe(401);
      expect((await post(sig)).body).toEqual({ received: true });
      expect((await post(sig)).body).toEqual({ received: true, duplicate: true });
      expect(await prisma.paymentEvent.count()).toBe(1);
      expect(JSON.stringify((await prisma.paymentEvent.findFirst())!.payload)).not.toContain('4111111111111111');
    } finally { delete process.env.CYBERSOURCE_WEBHOOK_SIGNATURE_KEY; }
  });
  it('enforces unique idempotency keys at the database level', async () => {
    const d = { idempotencyKey: 'k1', amountMinor: 1000, currency: 'GBP' };
    await prisma.paymentTransaction.create({ data: d });
    await expect(prisma.paymentTransaction.create({ data: d })).rejects.toMatchObject({ code: 'P2002' });
  });
});
