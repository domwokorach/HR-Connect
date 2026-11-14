import { Coffee, Info, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BarChart, PieChart } from '@/components/charts';
import { AreaChart } from '@/components/charts/area-chart';
import { ComposedChart } from '@/components/charts/composed-chart';
import { HeatmapChart } from '@/components/charts/heatmap-chart';
import { LineChart } from '@/components/charts/line-chart';
import { ProgressRingChart } from '@/components/charts/progress-ring-chart';
import { StackedAreaChart } from '@/components/charts/stacked-area-chart';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { Async, Badge, Banner, Button, Card, Chips, Divider, Field, Grid, Row, Screen, Section, Segmented, Sheet, T, label, toneFor, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, formatMinutes, minutesToHours, pct, startOfWeek, sum } from '@/lib/calc';
import { get, post, patch } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { WEEKDAYS, WEEKDAYS_SHORT, formatDate, formatTime, shortTime, todayIn } from '@/lib/time';
import type { AttendanceBreak, AttendanceRecord, Correction, WorkLocation, WorkSchedule } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { DateField, errMsg, timeRe, useDirectory, useScope, validDate } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';

interface TodayInfo { date: string; timezone: string; record: (AttendanceRecord & { breaks: AttendanceBreak[] }) | null; schedule: WorkSchedule; isWorkingDay: boolean }
interface WeeklyDay {
  date: string; weekday: number; isWorkingDay: boolean; isHoliday: boolean; scheduledMinutes: number; workedMinutes: number; totalWorkedMinutes: number;
  lateCount: number; lateMinutes: number; office: number; remote: number; overtimeMinutes: number; absent: number; onLeave: number; records: AttendanceRecord[];
}
interface Weekly { weekStart: string; days: WeeklyDay[]; totals: { workedMinutes: number; overtimeMinutes: number; lateCount: number }; schedule: WorkSchedule }

/** "Mon–Fri" / "Mon, Wed, Fri" from the schedule's real work days (1 = Monday … 7 = Sunday). */
function workDaysLabel(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const name = (n: number) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n - 1];
  if (d.length === 0) return '';
  if (d.length > 2 && d[d.length - 1] - d[0] === d.length - 1) return `${name(d[0])}–${name(d[d.length - 1])}`;
  return d.map(name).join(', ');
}

export default function Attendance() {
  const { role, employee, settings } = useAuth();
  const tz = settings.timezone;
  const today = todayIn(tz);
  const isLead = role !== 'staff';
  const [scopeMode, setScopeMode] = useState<'me' | 'team'>('me');
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const dir = useDirectory();
  const scope = useScope(dir.employees);
  const team = isLead && scopeMode === 'team';

  const info = useAsync(async () => {
    const [t, corrections] = await Promise.all([employee ? get<TodayInfo>('/attendance/today') : Promise.resolve(null), get<Correction[]>('/attendance/corrections')]);
    return { today: t, corrections };
  }, [employee?.id]);
  const range = useAsync(() => get<AttendanceRecord[]>(team ? '/attendance/team' : '/attendance/me', { from: addDays(today, -60), to: today }), [team]);
  const weekly = useAsync(() => get<Weekly>('/attendance/weekly', { weekStart, scope: team ? 'team' : 'me' }), [weekStart, team]);
  // overtime/corrections to approve need the team's records even when viewing "my time"
  const reviewRecs = useAsync(() => (isLead ? get<AttendanceRecord[]>('/attendance/team', { from: addDays(today, -60), to: today }) : Promise.resolve([] as AttendanceRecord[])), [isLead]);
  const refreshAll = () => { info.reload(); range.reload(); weekly.reload(); reviewRecs.reload(); };

  return (
    <Screen title="Time & Attendance" subtitle={`Company time zone: ${tz}`}
      actions={isLead ? <View style={{ width: 220 }}><Segmented value={scopeMode} onChange={setScopeMode} options={[{ value: 'me', label: 'My time' }, { value: 'team', label: role === 'admin' ? 'Everyone' : 'My team' }] } /></View> : null}>
      <Async state={{ ...info, loading: info.loading || dir.loading, error: info.error ?? dir.error }}>
        {(d) => (
          <>
            {employee && d.today ? <ClockCard today={d.today.date} tz={tz} record={d.today.record} breaks={d.today.record?.breaks ?? []} schedule={d.today.schedule} onChange={refreshAll} /> : <Banner tone="warning">Your account isn&apos;t linked to an employee record, so clocking is unavailable. Ask HR to link your email.</Banner>}
            <Async state={weekly}>{(w) => <WeekTable week={w} weekStart={weekStart} setWeekStart={setWeekStart} today={today} showAll={team} />}</Async>
            <Async state={range}>{(records) => <Analytics records={records} today={today} />}</Async>
            {employee ? <CorrectionRequest onDone={refreshAll} /> : null}
            {isLead ? <Approvals records={reviewRecs.data ?? []} corrections={d.corrections} onChange={refreshAll} tz={tz} meId={employee?.id ?? ''} admin={role === 'admin'} scopeIds={new Set(scope.map((s) => s.id))} /> : <MyCorrections corrections={d.corrections} />}
          </>
        )}
      </Async>
    </Screen>
  );
}

function ClockCard({ today, tz, record, breaks, schedule, onChange }: {
  today: string; tz: string; record: AttendanceRecord | null; breaks: AttendanceBreak[]; schedule: WorkSchedule | null; onChange: () => void;
}) {
  const { c } = useTheme();
  const toast = useToast();
  const [loc, setLoc] = useState<WorkLocation>('office');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const clockedIn = !!record?.clockIn && !record.clockOut;
  const done = !!record?.clockOut;
  const onLeave = record?.status === 'on_leave';
  const onBreak = breaks.some((b) => !b.endedAt);
  const startMin = schedule ? Number(schedule.startTime.slice(0, 2)) * 60 + Number(schedule.startTime.slice(3, 5)) : 540;
  const endMin = schedule ? Number(schedule.endTime.slice(0, 2)) * 60 + Number(schedule.endTime.slice(3, 5)) : 1020;
  const expected = Math.max(1, endMin - startMin - (schedule?.unpaidBreakMinutes ?? 0));
  const breakMins = breaks.reduce((s, b) => s + Math.max(0, Math.floor(((b.endedAt ? new Date(b.endedAt).getTime() : now) - new Date(b.startedAt).getTime()) / 60000)), 0);
  const elapsed = clockedIn ? Math.max(0, Math.floor((now - new Date(record!.clockIn!).getTime()) / 60000) - breakMins) : done ? record!.workedMinutes : 0;
  const expectedFinish = record?.clockIn ? new Date(new Date(record.clockIn).getTime() + (expected + breakMins) * 60000).toISOString() : null;
  const status = onLeave ? 'On approved leave' : done ? 'Shift complete' : clockedIn ? (onBreak ? 'On break' : 'Working') : 'Not clocked in';

  const call = async (fn: 'clock_in' | 'start_break' | 'end_break' | 'clock_out') => {
    setBusy(fn); setErr(null);
    try {
      await post({ clock_in: '/attendance/clock-in', start_break: '/attendance/start-break', end_break: '/attendance/end-break', clock_out: '/attendance/clock-out' }[fn], fn === 'clock_in' ? { location: loc } : undefined);
      toast.success({ clock_in: 'Clocked in', start_break: 'Break started', end_break: 'Back from break', clock_out: 'Clocked out — have a good evening' }[fn]);
      onChange();
    } catch (e) { setErr(errMsg(e)); toast.error('Action failed', errMsg(e)); }
    setBusy(null);
  };

  const locCard = (v: WorkLocation, title: string, sub: string, icon: HRIconName) => {
    const on = (record?.workLocation ?? loc) === v;
    const locked = !!record?.clockIn;
    return (
      <Pressable key={v} disabled={locked} onPress={() => setLoc(v)} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: locked }} accessibilityLabel={`${title}. ${sub}`}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.surface, opacity: locked && !on ? 0.5 : 1 }}>
        <Row><HRIcon name={icon} size="md" color={on ? c.info : c.muted} /><View style={{ flex: 1 }}><T v="h3">{title}</T><T v="small" muted>{sub}</T></View>{on ? <HRIcon name="completed" size="md" color={c.info} label="Selected" /> : null}</Row>
      </Pressable>
    );
  };

  const tile = (k: string, value: string) => (
    <View key={k} style={{ minHeight: 76, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <T v="label" muted style={{ textAlign: 'center' }}>{k}</T>
      <T style={{ fontSize: 20, lineHeight: 26, fontWeight: '400', textAlign: 'center' }} maxFontSizeMultiplier={1.2}>{value}</T>
    </View>
  );
  const scheduleLine = schedule ? `Schedule ${shortTime(schedule.startTime)}–${shortTime(schedule.endTime)}${schedule.workDays.length ? ` · ${workDaysLabel(schedule.workDays)}` : ''}` : null;

  return (
    <Card style={{ gap: 18, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 18 }}>
        {/* 1 · overview: everything on one centred axis */}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <T v="label" muted style={{ textAlign: 'center' }}>Today · {formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</T>
          <ProgressRingChart progress={Math.min(100, pct(elapsed, expected))} size={148} strokeWidth={12} centerText={formatMinutes(elapsed)} centerFontSize={30} label={`of ${formatMinutes(expected)}`} />
          <T style={{ fontSize: 20, lineHeight: 26, fontWeight: '400', textAlign: 'center' }} maxFontSizeMultiplier={1.2}>{status}</T>
          {record?.clockIn ? <Row wrap gap={8} style={{ justifyContent: 'center' }}>{record.workLocation ? <Badge label={record.workLocation === 'office' ? 'In Office' : 'Remote'} tone="info" /> : null}<Badge label={label(record.status)} tone={toneFor(record.status)} /></Row> : null}
        </View>
        {/* 2 · details: four equal tiles; two columns on phones, four when the card is wide enough */}
        <Grid min={110} gap={10}>
          {[tile('Clock in', formatTime(record?.clockIn, tz)), tile('Clock out', formatTime(record?.clockOut, tz)), tile('Break', formatMinutes(breakMins)), tile('Expected finish', expectedFinish ? formatTime(expectedFinish, tz) : schedule ? shortTime(schedule.endTime) : '—')]}
        </Grid>
        {/* 3 · live schedule (no hardcoded fallback) */}
        {scheduleLine ? <T v="small" muted style={{ textAlign: 'center' }}>{scheduleLine}</T> : null}
        {/* 4 · actions */}
        {!onLeave ? <View style={{ gap: 8 }}>
          <T v="small" muted style={{ fontWeight: '400', textAlign: 'center' }}>{record?.clockIn ? 'Working location' : 'Where are you working today?'}</T>
          <Row wrap gap={10}>{locCard('office', 'In Office', 'On site today', 'inOffice')}{locCard('remote', 'Out of Office / Remote', 'Working remotely', 'remote')}</Row>
        </View> : null}
        <Grid min={120} gap={10}>
          {[
            <Button key="in" title="Clock In" icon={<HRIcon name="clock" size="sm" color="#fff" />} variant="success" disabled={clockedIn || done || onLeave} loading={busy === 'clock_in'} onPress={() => call('clock_in')} style={{ width: '100%' }} />,
            <Button key="sb" title="Start Break" icon={<Coffee size={16} color={c.text} />} variant="secondary" disabled={!clockedIn || onBreak} loading={busy === 'start_break'} onPress={() => call('start_break')} style={{ width: '100%' }} />,
            <Button key="eb" title="End Break" icon={<Play size={16} color={c.text} />} variant="secondary" disabled={!onBreak} loading={busy === 'end_break'} onPress={() => call('end_break')} style={{ width: '100%' }} />,
            <Button key="out" title="Clock Out" icon={<HRIcon name="clock" size="sm" color="#fff" />} variant="danger" disabled={!clockedIn} loading={busy === 'clock_out'} onPress={() => call('clock_out')} style={{ width: '100%' }} />,
          ]}
        </Grid>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {/* 5 · server time & privacy */}
        <Row gap={8} align="flex-start" style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
          <View style={{ paddingTop: 2 }}><Info size={16} color={c.muted} /></View>
          <T v="small" muted style={{ flexShrink: 1, textAlign: 'center' }}>Times are recorded by the server in {tz}. No device location is collected.</T>
        </Row>
      </View>
    </Card>
  );
}

function WeekTable({ week, weekStart, setWeekStart, today, showAll }: { week: Weekly; weekStart: string; setWeekStart: (s: string) => void; today: string; showAll: boolean }) {
  const { c } = useTheme();
  const sched = `${shortTime(week.schedule.startTime)}–${shortTime(week.schedule.endTime)}`;
  const days = week.days.map((d, i) => ({ ...d, name: WEEKDAYS[i], r: showAll ? null : d.records[0] }));

  return (
    <Section title="Weekly schedule" right={
      <Row>
        <Button small variant="secondary" title="‹ Prev" onPress={() => setWeekStart(addDays(weekStart, -7))} />
        <T v="small" muted>{formatDate(weekStart, { day: 'numeric', month: 'short' })} – {formatDate(addDays(weekStart, 4), { day: 'numeric', month: 'short' })}</T>
        <Button small variant="secondary" title="Next ›" onPress={() => setWeekStart(addDays(weekStart, 7))} />
      </Row>}>
      <Grid min={360}>
        <Card pad={false}>
          <Row style={{ padding: 12, backgroundColor: c.surfaceAlt, borderTopLeftRadius: 15, borderTopRightRadius: 15 }}>
            {['Day', 'Scheduled', 'Actual', 'Status'].map((h, i) => <T key={h} v="label" muted style={{ flex: i === 0 ? 1.1 : i === 3 ? 1.2 : 1 }}>{h}</T>)}
          </Row>
          {days.map((d, i) => (
            <View key={d.date}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ padding: 12 }}>
                <View style={{ flex: 1.1 }}><T v="h3">{d.name}</T><T v="small" muted>{formatDate(d.date, { day: 'numeric', month: 'short' })}</T></View>
                <T style={{ flex: 1 }}>{d.isWorkingDay ? sched : d.isHoliday ? 'Holiday' : 'Off'}</T>
                <T style={{ flex: 1 }}>{showAll ? `${d.office + d.remote} in` : d.r?.clockIn ? formatMinutes(d.r.workedMinutes || 0) : '—'}</T>
                <View style={{ flex: 1.2 }}>
                  {showAll ? <T v="small" muted>{d.lateCount} late · {d.absent} absent</T>
                    : d.r ? <Badge label={d.r.status === 'remote' ? 'Remote' : label(d.r.status)} tone={toneFor(d.r.status)} /> : <T v="small" muted>{d.date > today ? 'Upcoming' : '—'}</T>}
                </View>
              </Row>
            </View>
          ))}
          <Divider />
          <Row style={{ padding: 12, justifyContent: 'space-between' }}><T v="h3">Week total</T><T>{formatMinutes(week.totals.workedMinutes)} · OT {formatMinutes(week.totals.overtimeMinutes)} · {week.totals.lateCount} late</T></Row>
        </Card>
        <ChartCard title={`Scheduled vs actual hours${showAll ? ' (average)' : ''}`}>
          <BarChart labels={WEEKDAYS_SHORT} unit="h" series={[{ name: 'Scheduled', values: days.map((d) => minutesToHours(d.scheduledMinutes)), color: c.border }, { name: 'Actual', values: days.map((d) => minutesToHours(d.workedMinutes)) }]} />
        </ChartCard>
        <ChartCard title="Attendance & overtime" description={`Monday–Friday · hours worked (bars) and overtime (line)${showAll ? ', average' : ''}`}
          summary={`Worked ${days.map((d, i) => `${WEEKDAYS_SHORT[i]} ${minutesToHours(d.workedMinutes)}h`).join(', ')}; overtime ${days.map((d, i) => `${WEEKDAYS_SHORT[i]} ${minutesToHours(d.overtimeMinutes)}h`).join(', ')}.`}>
          <ComposedChart labels={WEEKDAYS_SHORT} bars={{ name: 'Worked', unit: 'h', values: days.map((d) => minutesToHours(d.workedMinutes)) }} line={{ name: 'Overtime', unit: 'h', values: days.map((d) => minutesToHours(d.overtimeMinutes)) }}
            target={{ name: 'Scheduled (dashed)', value: Math.max(...days.map((d) => minutesToHours(d.scheduledMinutes))) }} />
        </ChartCard>
        <ChartCard title="Office vs remote · late arrivals">
          <BarChart stacked labels={WEEKDAYS_SHORT} series={[{ name: 'Office', values: days.map((d) => d.office) }, { name: 'Remote', values: days.map((d) => d.remote) }]} />
          <BarChart labels={WEEKDAYS_SHORT} unit="h" series={[{ name: 'Overtime', values: days.map((d) => minutesToHours(d.overtimeMinutes)), color: c.chart[3] }, { name: 'Late (hrs)', values: days.map((d) => minutesToHours(d.lateMinutes)), color: c.chart[2] }]} />
        </ChartCard>
      </Grid>
    </Section>
  );
}

function Analytics({ records, today }: { records: AttendanceRecord[]; today: string }) {
  const { c } = useTheme();
  const month = today.slice(0, 7);
  const worked = records.filter((r) => r.clockIn);
  const office = worked.filter((r) => r.workLocation === 'office').length;
  const remote = worked.filter((r) => r.workLocation === 'remote').length;

  // 8 weekly buckets ending this week
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(startOfWeek(today), -7 * (7 - i)));
  const weekLabel = weeks.map((w) => formatDate(w, { day: 'numeric', month: 'short' }));
  const inWeek = (w: string) => records.filter((r) => r.workDate >= w && r.workDate < addDays(w, 7));
  const lateTrend = weeks.map((w) => inWeek(w).filter((r) => r.lateMinutes > 0).length);
  const otTrend = weeks.map((w) => minutesToHours(sum(inWeek(w).filter((r) => r.overtimeStatus !== 'rejected').map((r) => r.overtimeMinutes))));
  const hoursTrend = weeks.map((w) => minutesToHours(sum(inWeek(w).map((r) => r.workedMinutes))));
  const cat = (w: string, f: (r: AttendanceRecord) => boolean) => inWeek(w).filter(f).length;
  const stackData = weeks.map((w, i) => ({ x: i, y: [cat(w, (r) => r.status === 'present'), cat(w, (r) => r.status === 'remote'), cat(w, (r) => r.status === 'late'), cat(w, (r) => r.status === 'on_leave'), cat(w, (r) => r.status === 'absent')], label: weekLabel[i] }));
  const monthRecs = records.filter((r) => r.workDate.startsWith(month));
  // calendar heatmap: rows = weeks of the last 5, columns = Mon–Fri, value = hours worked
  const calWeeks = Array.from({ length: 5 }, (_, i) => addDays(startOfWeek(today), -7 * (4 - i)));
  const heat = calWeeks.flatMap((w) => WEEKDAYS_SHORT.map((d, di) => {
    const day = addDays(w, di); const rs = records.filter((r) => r.workDate === day);
    return { row: formatDate(w, { day: 'numeric', month: 'short' }), col: d, value: Math.round(minutesToHours(sum(rs.map((r) => r.workedMinutes))) * 10) / 10 };
  }));
  const abs = (['absent', 'on_leave', 'late'] as const).map((s) => ({ label: label(s), value: records.filter((r) => r.status === s).length }));

  return (
    <Section title="Attendance analytics">
      <Grid min={380}>
        <ChartCard title="Monthly attendance trend" description={formatDate(`${month}-01`, { month: 'long', year: 'numeric' })} summary={`${monthRecs.filter((r) => r.clockIn).length} clocked-in days this month; ${weeks.length} weeks of working hours shown.`}>
          <AreaChart data={weeks.map((w, i) => ({ x: weekLabel[i], y: hoursTrend[i] }))} config={{ height: 200, gradient: true, interactive: true, yAxisWidth: 32 }} />
        </ChartCard>
        <ChartCard title="Daily working hours" description="Hours worked per week" summary={`Latest week ${hoursTrend[hoursTrend.length - 1]}h; peak ${Math.max(...hoursTrend)}h.`}>
          <LineChart data={weeks.map((w, i) => ({ x: weekLabel[i], y: hoursTrend[i] }))} config={{ height: 200, interactive: true, yAxisWidth: 32 }} />
        </ChartCard>
        <ChartCard title="Attendance calendar" description="Hours worked, last 5 weeks (darker = more hours)" summary="Each cell is one working day; empty cells are days with no clock-in.">
          <HeatmapChart data={heat} config={{ height: 220, colorScale: [c.surfaceAlt, c.chart[0]] }} />
        </ChartCard>
        <ChartCard title="Attendance categories over time" description="Days per category, weekly" summary={`Totals: ${['present', 'remote', 'late', 'on leave', 'absent'].map((n, i) => `${sum(stackData.map((d) => d.y[i]))} ${n}`).join(', ')}.`}>
          <StackedAreaChart categories={['Present', 'Remote', 'Late', 'On leave', 'Absent']} colors={[c.chart[0], c.chart[1], c.chart[2], c.chart[3], c.chart[4]]} data={stackData} config={{ height: 220 }} />
        </ChartCard>
        <ChartCard title="Office vs remote" description="Last 60 days" summary={`${office} office days, ${remote} remote days.`}>
          <PieChart data={[{ label: 'In office', value: office }, { label: 'Remote', value: remote }]} size={160} />
        </ChartCard>
        <ChartCard title="Late arrivals & overtime" description="Days late (amber) and overtime hours (indigo) per week" summary={`${sum(lateTrend)} late days and ${sum(otTrend)}h overtime across the period.`}>
          <BarChart labels={weekLabel} series={[{ name: 'Late days', values: lateTrend, color: c.chart[2] }, { name: 'Overtime h', values: otTrend, color: c.chart[3] }]} />
          <BarChart labels={abs.map((a) => a.label)} height={150} series={[{ name: 'Days', values: abs.map((a) => a.value), color: c.chart[4] }]} />
        </ChartCard>
      </Grid>
    </Section>
  );
}

function CorrectionRequest({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [tin, setTin] = useState('09:00');
  const [tout, setTout] = useState('17:00');
  const [loc, setLoc] = useState<WorkLocation>('office');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!validDate(date)) return setErr('Enter a valid date.');
    if (!timeRe.test(tin) || !timeRe.test(tout)) return setErr('Times must be HH:MM (24h).');
    if (tout <= tin) return setErr('Clock-out must be after clock-in.');
    if (!reason.trim()) return setErr('Please give a reason.');
    setBusy(true); setErr(null);
    try { await post('/attendance/corrections', { workDate: date, clockIn: tin, clockOut: tout, location: loc, reason: reason.trim() }); setOpen(false); setReason(''); onDone(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  return (
    <>
      <Row style={{ justifyContent: 'center' }}><Button variant="secondary" title="Request attendance correction" onPress={() => setOpen(true)} /></Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Attendance correction">
        <DateField label="Date" value={date} onChange={setDate} />
        <Row><Field label="Clock-in (HH:MM)" value={tin} onChangeText={setTin} maxLength={5} /><Field label="Clock-out (HH:MM)" value={tout} onChangeText={setTout} maxLength={5} /></Row>
        <Chips label="Location" value={loc} onChange={setLoc} options={[{ value: 'office', label: 'In Office' }, { value: 'remote', label: 'Remote' }]} />
        <Field label="Reason" value={reason} onChangeText={setReason} multiline />
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <Button title="Submit for approval" onPress={submit} loading={busy} />
      </Sheet>
    </>
  );
}

function MyCorrections({ corrections }: { corrections: Correction[] }) {
  if (!corrections.length) return null;
  return (
    <Section title="My correction requests">
      <Card style={{ gap: 10 }}>
        {corrections.slice(0, 8).map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}><T>{formatDate(c.workDate)} — {c.reason}</T><Badge label={label(c.status)} tone={toneFor(c.status)} /></Row>
        ))}
      </Card>
    </Section>
  );
}

function Approvals({ records, corrections, onChange, tz, meId, admin, scopeIds }: {
  records: AttendanceRecord[]; corrections: Correction[]; onChange: () => void; tz: string; meId: string; admin: boolean; scopeIds: Set<string>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const pendingOT = records.filter((r) => r.overtimeStatus === 'pending' && r.employeeId !== meId && scopeIds.has(r.employeeId));
  const pendingCor = corrections.filter((x) => x.status === 'pending' && x.employeeId !== meId);

  const act = async (fn: 'review_overtime' | 'review_correction', id: string, approve: boolean) => {
    setErr(null);
    try {
      if (fn === 'review_overtime') await patch(`/attendance/${id}/overtime`, { approve });
      else await patch(`/attendance/corrections/${id}/${approve ? 'approve' : 'reject'}`);
      onChange();
    } catch (e) { setErr(errMsg(e)); }
  };
  const closeDay = async () => {
    setClosing(true); setErr(null); setInfo(null);
    try { const out = await post<{ date: string; recorded: number }>('/attendance/close-day', {}); setInfo(`Recorded ${out.recorded} absence/holiday record(s) for ${out.date}.`); onChange(); }
    catch (e) { setErr(errMsg(e)); }
    setClosing(false);
  };

  return (
    <Section title="Approvals" right={admin ? <Button small variant="secondary" title="Close previous day" loading={closing} onPress={closeDay} /> : null}>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      {info ? <Banner tone="success">{info}</Banner> : null}
      <Grid min={340}>
        <Card style={{ gap: 12, alignItems: pendingOT.length === 0 ? 'center' : 'stretch' }}>
          <T v="h3" style={pendingOT.length === 0 ? { textAlign: 'center' } : undefined}>Overtime awaiting approval ({pendingOT.length})</T>
          {pendingOT.length === 0 ? <T muted style={{ textAlign: 'center', paddingVertical: 8 }}>Nothing pending.</T> : pendingOT.slice(0, 20).map((r) => (
            <Row key={r.id} wrap style={{ justifyContent: 'space-between' }}>
              <View><T v="h3">{r.employee?.fullName ?? 'Employee'}</T><T v="small" muted>{formatDate(r.workDate)} · +{formatMinutes(r.overtimeMinutes)}</T></View>
              <Row><Button small title="Approve" variant="success" onPress={() => act('review_overtime', r.id, true)} /><Button small title="Reject" variant="secondary" onPress={() => act('review_overtime', r.id, false)} /></Row>
            </Row>))}
        </Card>
        <Card style={{ gap: 12, alignItems: pendingCor.length === 0 ? 'center' : 'stretch' }}>
          <T v="h3" style={pendingCor.length === 0 ? { textAlign: 'center' } : undefined}>Correction requests ({pendingCor.length})</T>
          {pendingCor.length === 0 ? <T muted style={{ textAlign: 'center', paddingVertical: 8 }}>Nothing pending.</T> : pendingCor.slice(0, 20).map((x) => (
            <View key={x.id} style={{ gap: 6 }}>
              <T v="h3">{x.employee?.fullName ?? 'Employee'} · {formatDate(x.workDate)}</T>
              <T v="small" muted>{formatTime(x.requestedClockIn, tz)}–{formatTime(x.requestedClockOut, tz)} · {x.workLocation} · “{x.reason}”</T>
              <Row><Button small title="Approve" variant="success" onPress={() => act('review_correction', x.id, true)} /><Button small title="Reject" variant="secondary" onPress={() => act('review_correction', x.id, false)} /></Row>
            </View>))}
        </Card>
      </Grid>
    </Section>
  );
}
