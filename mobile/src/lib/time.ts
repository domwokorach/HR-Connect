import { toISO } from './calc';

/** Today's date (YYYY-MM-DD) in the company time zone. Falls back to device-local if Intl lacks the zone. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return toISO(now);
  }
}

export function formatTime(ts: string | null | undefined, tz: string): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
  } catch {
    return new Date(ts).toTimeString().slice(0, 5);
  }
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', opts).format(new Date(y, m - 1, d));
}

export function formatDateTime(ts: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
  } catch {
    return ts;
  }
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const shortTime = (t: string) => t.slice(0, 5);
