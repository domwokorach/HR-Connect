import { DateTime } from 'luxon';

export const todayIn = (tz: string, now = new Date()) => DateTime.fromJSDate(now, { zone: tz }).toISODate()!;
export const addDays = (iso: string, n: number) => DateTime.fromISO(iso, { zone: 'utc' }).plus({ days: n }).toISODate()!;
export const isoWeekday = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).weekday; // Mon=1 … Sun=7
export const startOfWeek = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
export const monthStart = (iso: string) => iso.slice(0, 7) + '-01';
export const monthEnd = (iso: string) => DateTime.fromISO(monthStart(iso), { zone: 'utc' }).endOf('month').toISODate()!;
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;

/** Wall-clock date + "HH:mm" in a zone → instant. */
export function zonedInstant(date: string, hhmm: string, tz: string): Date {
  const dt = DateTime.fromISO(`${date}T${hhmm}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid date/time ${date} ${hhmm}`);
  return dt.toJSDate();
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Working days in [start, end]: skips non-working weekdays and holidays (no double counting). */
export function workingDaysBetween(start: string, end: string, workDays: number[], holidays: Set<string>): number {
  return eachDay(start, end).filter((d) => workDays.includes(isoWeekday(d)) && !holidays.has(d)).length;
}

export const minutesBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 60000);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
