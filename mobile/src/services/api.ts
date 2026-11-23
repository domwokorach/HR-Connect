import axios, { AxiosError, create, isAxiosError, type AxiosRequestConfig } from 'axios';
import { Linking, Platform } from 'react-native';
import { apiBaseUrl } from './config';
import { clientType, getAccess, getRefresh, setAccess, setRefresh } from './token-store';

export const http = create({ baseURL: `${apiBaseUrl()}/api`, timeout: 20000, withCredentials: true, headers: { 'X-Client-Type': clientType } });

export interface SessionUser { id: string; email: string; role: 'ADMIN' | 'MANAGER' | 'STAFF'; fullName: string; employeeId: string | null; mustChangePassword: boolean }
interface AuthResponse { accessToken: string; refreshToken?: string; user: SessionUser }

let onExpired: () => void = () => {};
export const setSessionExpiredHandler = (fn: () => void) => { onExpired = fn; };

export type ErrorKind = 'offline' | 'denied' | 'database' | 'server' | 'rate' | 'other';

/** Classify a failure so screens can pick the right recovery; `message` is always safe to show the user. */
export function describeError(e: unknown): { kind: ErrorKind; message: string; retryable: boolean } {
  if (isAxiosError(e)) {
    const body = e.response?.data as { error?: string; code?: string } | undefined;
    const status = e.response?.status;
    if (!e.response) return { kind: 'offline', message: 'Cannot reach the server. Check your connection and the API address.', retryable: true };
    if (status === 429) return { kind: 'rate', message: body?.error ?? 'Too many attempts. Please wait a few minutes and try again.', retryable: false };
    if (status === 403) return { kind: 'denied', message: body?.error ?? 'You do not have permission to view this.', retryable: false };
    if (body?.code === 'SCHEMA_OUT_OF_DATE' || body?.code === 'DATABASE_UNAVAILABLE') return { kind: 'database', message: body.error ?? 'The database is unavailable.', retryable: body.code === 'DATABASE_UNAVAILABLE' };
    if (status && status >= 500) return { kind: 'server', message: 'The service is temporarily unavailable. Please try again shortly.', retryable: [502, 503, 504].includes(status) };
    if (body?.error) return { kind: 'other', message: body.error, retryable: false };
    return { kind: 'other', message: `Request failed (${status})`, retryable: false };
  }
  return { kind: 'other', message: e instanceof Error ? e.message : String(e), retryable: false };
}

/** Turn any failure into an Error whose message is safe to show the user. */
export const errorMessage = (e: unknown): string => describeError(e).message;

http.interceptors.request.use((cfg) => {
  const t = getAccess();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing: Promise<SessionUser | null> | null = null;

/** Single-flight refresh: concurrent 401s share one rotation (rotating tokens must never be replayed). */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= (async () => {
    try {
      const stored = await getRefresh();
      if (clientType === 'mobile' && !stored) return null;
      const { data } = await axios.post<AuthResponse>(`${http.defaults.baseURL}/auth/refresh`, clientType === 'mobile' ? { refreshToken: stored } : {}, {
        withCredentials: true, headers: { 'X-Client-Type': clientType }, timeout: 20000,
      });
      setAccess(data.accessToken);
      if (data.refreshToken) await setRefresh(data.refreshToken, rememberSession);
      return data.user;
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 401) { setAccess(null); await setRefresh(null); }
      return null;
    } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

http.interceptors.response.use((r) => r, async (error: AxiosError) => {
  const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthCall = cfg?.url?.startsWith('/auth/login') || cfg?.url?.startsWith('/auth/refresh');
  if (error.response?.status === 401 && cfg && !cfg._retried && !isAuthCall) {
    cfg._retried = true;
    const user = await refreshSession();
    if (user) { cfg.headers = { ...cfg.headers, Authorization: `Bearer ${getAccess()}` } as never; return http(cfg); }
    onExpired();
  }
  return Promise.reject(error);
});

let rememberSession = true;

export async function loginRequest(email: string, password: string, remember = true): Promise<SessionUser> {
  const { data } = await http.post<AuthResponse>('/auth/login', { email, password, remember });
  rememberSession = remember;
  setAccess(data.accessToken);
  if (data.refreshToken) await setRefresh(data.refreshToken, remember);
  return data.user;
}

export async function logoutRequest() {
  try { await http.post('/auth/logout', clientType === 'mobile' ? { refreshToken: await getRefresh() } : {}); } catch { /* best effort */ }
  setAccess(null); await setRefresh(null);
}

// Thin typed helpers — they unwrap `.data` so screens stay readable.
export const get = <T>(url: string, params?: Record<string, unknown>) => http.get<T>(url, { params }).then((r) => r.data);
export const post = <T = unknown>(url: string, body?: unknown) => http.post<T>(url, body).then((r) => r.data);
export const patch = <T = unknown>(url: string, body?: unknown) => http.patch<T>(url, body).then((r) => r.data);
export const del = <T = unknown>(url: string) => http.delete<T>(url).then((r) => r.data);

export async function uploadFile(asset: { uri: string; name: string; mimeType?: string | null }, kind: 'leave_document' | 'resume'): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') form.append('file', await (await fetch(asset.uri)).blob(), asset.name);
  else form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' } as never);
  const { data } = await http.post<{ id: string }>('/uploads', form, { params: { kind }, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.id;
}

/** Files are fetched through a short-lived signed link so the browser/OS viewer needs no auth header. */
export async function openFile(id: string) {
  const { url } = await post<{ url: string }>(`/uploads/${id}/link`);
  await Linking.openURL(`${apiBaseUrl()}${url}`);
}
