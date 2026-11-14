import { DateTime } from 'luxon';
import { minutesBetween } from './dates';

export interface CalcInput {
  workDate: string;
  tz: string;
  clockIn: Date | null;
  clockOut: Date | null;
  breaks: { startedAt: Date; endedAt: Date | null }[];
  isWorkingDay: boolean;
  schedule: { startTime: string; endTime: string; unpaidBreakMinutes: number };
  graceMinutes: number;
  location: 'office' | 'remote' | null;
  now?: Date;
}
export interface CalcResult {
  scheduledMinutes: number; breakMinutes: number; workedMinutes: number; lateMinutes: number;
  earlyDepartureMinutes: number; overtimeMinutes: number; status: 'present' | 'late' | 'remote' | null;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Single source of truth for working-time maths (time-zone aware, break aware). */
export function computeAttendance(i: CalcInput): CalcResult {
  const sched = i.isWorkingDay ? toMin(i.schedule.endTime) - toMin(i.schedule.startTime) - i.schedule.unpaidBreakMinutes : 0;
  let late = 0, worked = 0, overtime = 0, early = 0;

  if (i.clockIn && i.isWorkingDay) {
    const start = DateTime.fromISO(`${i.workDate}T${i.schedule.startTime}`, { zone: i.tz });
    late = Math.floor(DateTime.fromJSDate(i.clockIn, { zone: i.tz }).diff(start, 'minutes').minutes);
    if (late <= i.graceMinutes) late = 0;
  }

  const endRef = i.clockOut ?? i.now ?? new Date();
  const recorded = i.breaks.reduce((s, b) => s + Math.max(0, (((b.endedAt ?? endRef).getTime() - b.startedAt.getTime()) / 60000)), 0);

  if (i.clockIn && i.clockOut) {
    // recorded breaks are deducted, but never less than the schedule's configured unpaid break
    const deduct = i.isWorkingDay ? Math.max(recorded, i.schedule.unpaidBreakMinutes) : recorded;
    worked = Math.max(0, Math.floor(minutesBetween(i.clockIn, i.clockOut) - deduct));
    overtime = Math.max(0, worked - sched);
    const out = DateTime.fromJSDate(i.clockOut, { zone: i.tz });
    if (i.isWorkingDay && out.toISODate() === i.workDate) {
      early = Math.max(0, Math.floor(DateTime.fromISO(`${i.workDate}T${i.schedule.endTime}`, { zone: i.tz }).diff(out, 'minutes').minutes));
    }
  }

  const status = !i.clockIn ? null : late > 0 ? 'late' : i.location === 'remote' ? 'remote' : 'present';
  return { scheduledMinutes: sched, breakMinutes: Math.round(recorded), workedMinutes: worked, lateMinutes: late, earlyDepartureMinutes: early, overtimeMinutes: overtime, status };
}
