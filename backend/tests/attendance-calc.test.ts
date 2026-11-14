import { describe, expect, it } from 'vitest';
import { computeAttendance } from '../src/lib/attendance-calc';

const base = { tz: 'Europe/London', schedule: { startTime: '09:00', endTime: '17:00', unpaidBreakMinutes: 0 }, graceMinutes: 5, isWorkingDay: true, breaks: [] as { startedAt: Date; endedAt: Date | null }[], location: 'office' as const };
const at = (iso: string) => new Date(iso);

describe('attendance calculation', () => {
  it('on-time 09:00–17:00 is 8h present', () => {
    const r = computeAttendance({ ...base, workDate: '2026-01-12', clockIn: at('2026-01-12T09:00:00Z'), clockOut: at('2026-01-12T17:00:00Z') });
    expect(r).toMatchObject({ workedMinutes: 480, lateMinutes: 0, overtimeMinutes: 0, earlyDepartureMinutes: 0, status: 'present' });
  });
  it('late arrival beyond grace', () => {
    const r = computeAttendance({ ...base, workDate: '2026-01-13', clockIn: at('2026-01-13T09:20:00Z'), clockOut: at('2026-01-13T17:00:00Z') });
    expect(r).toMatchObject({ lateMinutes: 20, workedMinutes: 460, status: 'late' });
  });
  it('within grace is not late', () => {
    expect(computeAttendance({ ...base, workDate: '2026-01-14', clockIn: at('2026-01-14T09:04:00Z'), clockOut: null }).lateMinutes).toBe(0);
  });
  it('breaks are deducted and overtime computed', () => {
    const r = computeAttendance({ ...base, workDate: '2026-01-15', clockIn: at('2026-01-15T09:00:00Z'), clockOut: at('2026-01-15T18:30:00Z'), breaks: [{ startedAt: at('2026-01-15T12:00:00Z'), endedAt: at('2026-01-15T12:30:00Z') }] });
    expect(r).toMatchObject({ breakMinutes: 30, workedMinutes: 540, overtimeMinutes: 60 });
  });
  it('configured unpaid break is the minimum deduction', () => {
    const r = computeAttendance({ ...base, schedule: { ...base.schedule, unpaidBreakMinutes: 60 }, workDate: '2026-01-12', clockIn: at('2026-01-12T09:00:00Z'), clockOut: at('2026-01-12T17:00:00Z') });
    expect(r).toMatchObject({ scheduledMinutes: 420, workedMinutes: 420, overtimeMinutes: 0 });
  });
  it('early departure', () => {
    const r = computeAttendance({ ...base, workDate: '2026-01-16', clockIn: at('2026-01-16T09:00:00Z'), clockOut: at('2026-01-16T16:30:00Z') });
    expect(r).toMatchObject({ earlyDepartureMinutes: 30, workedMinutes: 450 });
  });
  it('handles British Summer Time: 08:00Z is 09:00 local, 09:00Z is an hour late', () => {
    expect(computeAttendance({ ...base, workDate: '2026-07-06', clockIn: at('2026-07-06T08:00:00Z'), clockOut: at('2026-07-06T16:00:00Z') })).toMatchObject({ lateMinutes: 0, workedMinutes: 480 });
    expect(computeAttendance({ ...base, workDate: '2026-07-07', clockIn: at('2026-07-07T09:00:00Z'), clockOut: at('2026-07-07T17:00:00Z') }).lateMinutes).toBe(60);
  });
  it('non-working day: never late, everything is overtime', () => {
    const r = computeAttendance({ ...base, isWorkingDay: false, workDate: '2026-01-17', clockIn: at('2026-01-17T10:00:00Z'), clockOut: at('2026-01-17T12:00:00Z') });
    expect(r).toMatchObject({ scheduledMinutes: 0, lateMinutes: 0, overtimeMinutes: 120 });
  });
  it('remote status when on time', () => {
    expect(computeAttendance({ ...base, location: 'remote', workDate: '2026-01-12', clockIn: at('2026-01-12T09:00:00Z'), clockOut: null }).status).toBe('remote');
  });
});
