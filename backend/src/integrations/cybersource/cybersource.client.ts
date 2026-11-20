import { createHash, createHmac } from 'node:crypto';
import type { CybersourceConfig } from './cybersource.config';

export type CsErrorCategory = 'not_configured' | 'auth' | 'forbidden' | 'not_found' | 'rate_limited' | 'provider' | 'timeout' | 'network';
export class CybersourceError extends Error {
  constructor(public category: CsErrorCategory, public status?: number) { super(`Cybersource request failed: ${category}`); }
}

const categorise = (status: number): CsErrorCategory =>
  status === 401 ? 'auth' : status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 429 ? 'rate_limited' : 'provider';

/** HTTP Signature (HmacSHA256) headers for the shared-secret key type. The secret is base64 and is decoded before HMAC. */
export function signRequest(cfg: CybersourceConfig, method: 'GET' | 'POST', path: string, body: string | undefined, date = new Date()) {
  const host = new URL(cfg.baseUrl).host;
  const dateHeader = date.toUTCString();
  const lines = [`host: ${host}`, `date: ${dateHeader}`, `(request-target): ${method.toLowerCase()} ${path}`];
  const names = ['host', 'date', '(request-target)'];
  const headers: Record<string, string> = { Host: host, Date: dateHeader, 'v-c-merchant-id': cfg.orgId };
  if (method === 'POST') {
    const digest = `SHA-256=${createHash('sha256').update(body ?? '').digest('base64')}`;
    lines.push(`digest: ${digest}`); names.push('digest'); headers.Digest = digest;
  }
  lines.push(`v-c-merchant-id: ${cfg.orgId}`); names.push('v-c-merchant-id');
  const signature = createHmac('sha256', Buffer.from(cfg.sharedSecret, 'base64')).update(lines.join('\n')).digest('base64');
  headers.Signature = `keyid="${cfg.keyId}", algorithm="HmacSHA256", headers="${names.join(' ')}", signature="${signature}"`;
  return headers;
}

export interface CsResponse<T = unknown> { status: number; data: T }

/** Only idempotent GETs are retried (once, on network/5xx). POSTs are never auto-retried: a repeat could double-charge. */
export async function csRequest<T = unknown>(cfg: CybersourceConfig, method: 'GET' | 'POST', path: string, payload?: unknown, fetchImpl: typeof fetch = fetch): Promise<CsResponse<T>> {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const attempts = method === 'GET' ? 2 : 1;
  let last: CybersourceError = new CybersourceError('network');
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(cfg.baseUrl + path, {
        method, body, signal: ctrl.signal,
        headers: { Accept: 'application/hal+json;charset=utf-8', ...(body ? { 'Content-Type': 'application/json;charset=utf-8' } : {}), ...signRequest(cfg, method, path, body) },
      });
      const text = await res.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body: ignored, never surfaced */ }
      if (res.ok) return { status: res.status, data: data as T };
      last = new CybersourceError(categorise(res.status), res.status);
      if (res.status < 500) throw last;
    } catch (e) {
      if (e instanceof CybersourceError) { last = e; if (!(e.status && e.status >= 500)) throw e; }
      else last = new CybersourceError((e as Error).name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
  }
  throw last;
}
