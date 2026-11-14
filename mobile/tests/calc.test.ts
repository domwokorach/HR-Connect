import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, csvCell, effectiveTrainingStatus, formatMinutes, isoWeekday, leaveRemaining, monthRange, pct,
  startOfWeek, toCSV, workingDaysBetween,
} from '../src/lib/calc.ts';

test('isoWeekday / startOfWeek', () => {
  assert.equal(isoWeekday('2026-01-12'), 1); // Monday
  assert.equal(isoWeekday('2026-01-18'), 7); // Sunday
  assert.equal(startOfWeek('2026-01-15'), '2026-01-12');
  assert.equal(startOfWeek('2026-01-18'), '2026-01-12');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('monthRange handles leap years', () => {
  assert.deepEqual(monthRange('2028-02-10'), { start: '2028-02-01', end: '2028-02-29' });
});

test('workingDaysBetween skips weekends and holidays without double counting', () => {
  // Fri 18 Dec → Mon 28 Dec 2026, Christmas Day (Fri 25) is a holiday: 18,21,22,23,24,28
  assert.equal(workingDaysBetween('2026-12-18', '2026-12-28', [1, 2, 3, 4, 5], ['2026-12-25']), 6);
  assert.equal(workingDaysBetween('2026-01-17', '2026-01-18'), 0); // a weekend only
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-09'), 5);
  assert.equal(workingDaysBetween('2026-01-09', '2026-01-05'), 0);
  // a holiday that falls on a weekend must not subtract anything extra
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-11', [1, 2, 3, 4, 5], ['2026-01-10']), 5);
});

test('custom schedules (4-day week)', () => {
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-11', [1, 2, 3, 4]), 4);
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(480), '8h');
  assert.equal(formatMinutes(450), '7h 30m');
  assert.equal(formatMinutes(20), '20m');
  assert.equal(formatMinutes(-5), '0m');
});

test('training status is derived from due date', () => {
  assert.equal(effectiveTrainingStatus({ status: 'in_progress', dueDate: '2026-01-01', progress: 40 }, '2026-02-01'), 'overdue');
  assert.equal(effectiveTrainingStatus({ status: 'completed', dueDate: '2026-01-01', progress: 100 }, '2026-02-01'), 'completed');
  assert.equal(effectiveTrainingStatus({ status: 'not_started', dueDate: '2026-03-01', progress: 0 }, '2026-02-01'), 'not_started');
});

test('leaveRemaining never negative', () => {
  assert.equal(leaveRemaining({ entitled: 25, used: 10 }, 3), 12);
  assert.equal(leaveRemaining({ entitled: 5, used: 5 }, 3), 0);
});

test('pct', () => { assert.equal(pct(1, 3), 33); assert.equal(pct(1, 0), 0); });

test('CSV escaping and formula-injection guard', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(-5), '-5');
  assert.equal(toCSV([{ a: 1, b: 'x' }, { a: 2 }]), 'a,b\n1,x\n2,');
});
