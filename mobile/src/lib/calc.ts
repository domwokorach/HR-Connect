// Pure helpers (no imports) so they can be unit-tested with `node --test`.
// The database is the source of truth for attendance/payroll maths; these power previews and charts.

export function pad(n: number) { return String(n).padStart(2, '0'); }

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date (avoids the UTC shift of `new Date('YYYY-MM-DD')`). */
export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: string): number {
  const d = fromISO(iso).getDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function monthRange(iso: string): { start: string; end: string } {
  const d = fromISO(iso);
  return { start: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), end: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/** Working days in [start, end], skipping non-working weekdays and holidays. Mirrors `working_days_between` in SQL. */
export function workingDaysBetween(start: string, end: string, workDays: number[] = [1, 2, 3, 4, 5], holidays: string[] = []): number {
  if (end < start) return 0;
  const hol = new Set(holidays);
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (workDays.includes(isoWeekday(d)) && !hol.has(d)) n++;
  }
  return n;
}

/** 450 -> "7h 30m", 480 -> "8h", 0 -> "0h". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export const minutesToHours = (min: number) => Math.round((min / 60) * 100) / 100;

export function formatMoney(n: number, currency = 'GBP'): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Training that is past due and unfinished is overdue even if the stored status is stale. */
export function effectiveTrainingStatus(
  a: { status: string; dueDate: string; progress: number },
  today: string,
): 'not_started' | 'in_progress' | 'completed' | 'overdue' {
  if (a.status === 'completed' || a.progress >= 100) return 'completed';
  if (a.dueDate < today) return 'overdue';
  return a.progress > 0 ? 'in_progress' : 'not_started';
}

export function leaveRemaining(b: { entitled: number; used: number }, pending = 0): number {
  return Math.max(0, b.entitled - b.used - pending);
}

export function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0); }

export function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function groupCount<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) { const k = key(x); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/** Quote a CSV cell per RFC 4180 and neutralise spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}
