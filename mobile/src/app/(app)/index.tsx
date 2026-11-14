import { useRouter } from 'expo-router';
import { Download } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart, LineChart as MultiLine } from '@/components/charts';
import { DoughnutChart } from '@/components/charts/doughnut-chart';
import { LineChart } from '@/components/charts/line-chart';
import { ProgressRingChart } from '@/components/charts/progress-ring-chart';
import { StackedAreaChart } from '@/components/charts/stacked-area-chart';
import { TreeMapChart } from '@/components/charts/treemap-chart';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { AttendanceOverview } from '@/components/dashboard/AttendanceOverview';
import { QuickActionCard } from '@/components/dashboard/QuickActionCard';
import { Async, Avatar, Badge, Button, Card, Divider, Grid, Row, Screen, Segmented, StatCard, T, label, toneFor, useBreakpoint } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatMinutes, formatMoney, pct } from '@/lib/calc';
import { exportCSV } from '@/lib/export';
import { useTheme } from '@/lib/theme';
import { WEEKDAYS_SHORT, formatDate } from '@/lib/time';
import { useAsync } from '@/lib/use-async';
import { get } from '@/services/api';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';

interface Dashboard {
  today: string; totalEmployees: number; presentToday: number; presentPrevDay: number; inOffice: number; remote: number; absentToday: number; pendingLeave: number;
  monthlyPayroll: { period: string; net: number; gross: number; previousNet: number | null } | null; trainingCompletion: number; trainingAssigned: number;
  trainingBreakdown: { completed: number; in_progress: number; not_started: number; overdue: number };
  weekly: { date: string; office: number; remote: number; onLeave: number; workedHours: number; scheduledHours: number }[];
  presentTrend: { date: string; present: number; remote: number; late: number }[];
  payrollTrend: { period: string; status: string; gross: number; net: number; bonuses: number; overtime: number; deductions: number }[];
  departments: { name: string; count: number }[];
  pendingApprovals: { leave: { id: string; employee: string; type: string; startDate: string; endDate: string; days: number }[]; overtime: number; corrections: number };
  recentActivity: { kind: string; title: string; detail: string; at: string }[]; myRequests: { id: string; type: string; startDate: string; endDate: string; status: string }[];
  me: { workedMinutesThisWeek: number; leaveRemaining: number };
}

const ACTIVITY_ICONS: Record<string, HRIconName> = { employee: 'employees', clock: 'clock', leave: 'calendar', training: 'training', payroll: 'wallet' };

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function DashboardScreen() {
  const { role, profile } = useAuth();
  const { c } = useTheme();
  const router = useRouter();
  const data = useAsync(() => get<Dashboard>('/reports/dashboard'), [role]);
  const [range, setRange] = useState<'7' | '14'>('14');
  const isStaff = role === 'staff';
  const first = profile?.fullName.split(' ')[0] ?? '';

  const exportReport = (v: Dashboard) => exportCSV('dashboard-summary', [
    { metric: 'Total employees', value: v.totalEmployees }, { metric: 'Present today', value: v.presentToday }, { metric: 'In office', value: v.inOffice }, { metric: 'Remote', value: v.remote },
    { metric: 'Absent / not in yet', value: v.absentToday }, { metric: 'Pending leave', value: v.pendingLeave }, { metric: 'Training completion %', value: v.trainingCompletion },
    ...(v.monthlyPayroll ? [{ metric: `Net payroll ${v.monthlyPayroll.period.slice(0, 7)}`, value: v.monthlyPayroll.net }] : []),
    ...v.presentTrend.map((d) => ({ metric: `Present ${d.date}`, value: d.present })),
  ]);

  return (
    <Screen title={`${greeting()}, ${first}`} subtitle={isStaff ? "Here's your week at a glance." : role === 'manager' ? "Here's what's happening across your team today." : "Here's what's happening across your organisation today."}
      actions={<Row wrap>
        {!isStaff ? <View style={{ width: 190, maxWidth: '100%' }}><Segmented value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }]} /></View> : null}
        {data.data && !isStaff ? <Button title="Export report" variant="secondary" icon={<Download size={16} color={c.text} />} onPress={() => exportReport(data.data!)} /> : null}
        <Button title="Clock in / out" icon={<HRIcon name="clock" size="sm" color={c.onPrimary} />} onPress={() => router.push('/attendance' as never)} />
      </Row>}>
      <Async state={data}>
        {(v) => <DashboardBody v={v} role={role} range={Number(range)} />}
      </Async>
    </Screen>
  );
}

function DashboardBody({ v, role, range }: { v: Dashboard; role: string; range: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const isStaff = role === 'staff';
  const trend = useMemo(() => v.presentTrend.slice(-Math.max(2, Math.round(range * 5 / 7))), [v.presentTrend, range]);
  const dayLabel = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
  const presentDelta = v.presentToday - v.presentPrevDay;
  const payDelta = v.monthlyPayroll?.previousNet ? ((v.monthlyPayroll.net - v.monthlyPayroll.previousNet) / v.monthlyPayroll.previousNet) * 100 : null;
  const tb = v.trainingBreakdown;
  const colors = [c.chart[0], c.chart[1], c.chart[2]];

  return (
    <>
      {isStaff ? (
        <Grid min={isMobile ? 150 : 220} gap={isMobile ? 10 : 16}>
          <StatCard label="Hours this week" value={formatMinutes(v.me.workedMinutesThisWeek)} icon={<HRIcon name="clock" size="md" color={c.info} />} sub={`of 40h scheduled`} />
          <StatCard label="Leave days left" value={v.me.leaveRemaining} icon={<HRIcon name="calendar" size="md" color={c.success} />} tone="success" />
          <StatCard label="Training completion" value={`${v.trainingCompletion}%`} icon={<HRIcon name="training" size="md" color={c.accent} />} tone="accent" sub={`${v.trainingAssigned} assigned`} />
          <StatCard label="Pending requests" value={v.myRequests.filter((r) => r.status === 'pending').length} icon={<HRIcon name="pending" size="md" color={c.warning} />} tone="warning" />
        </Grid>
      ) : (
        <Grid min={isMobile ? 150 : 230} gap={isMobile ? 10 : 16}>
          <StatCard label={role === 'manager' ? 'Team members' : 'Total employees'} value={v.totalEmployees} icon={<HRIcon name="team" size="md" color={c.info} />} sub="Active headcount" />
          <StatCard label="Present today" value={v.presentToday} icon={<HRIcon name="completed" size="md" color={c.success} />} tone="success" trend={v.presentTrend.map((d) => d.present)}
            delta={{ text: `${presentDelta >= 0 ? '+' : ''}${presentDelta} vs previous workday`, tone: presentDelta > 0 ? 'success' : presentDelta < 0 ? 'danger' : 'neutral', dir: presentDelta > 0 ? 'up' : presentDelta < 0 ? 'down' : 'flat' }} />
          <StatCard label="Working in office" value={v.inOffice} icon={<HRIcon name="inOffice" size="md" color={c.info} />} tone="info" sub={`${pct(v.inOffice, v.presentToday)}% of those present`} />
          <StatCard label="Working remotely" value={v.remote} icon={<HRIcon name="remote" size="md" color={c.accent} />} tone="accent" trend={v.presentTrend.map((d) => d.remote)} />
          <StatCard label="Employees absent" value={v.absentToday} icon={<HRIcon name="overdue" size="md" color={c.danger} />} tone="danger" sub="Not clocked in, no leave" />
          <StatCard label="Pending leave requests" value={v.pendingLeave} icon={<HRIcon name="pending" size="md" color={c.warning} />} tone="warning" sub={v.pendingLeave ? 'Awaiting a decision' : 'All caught up'} />
          {role === 'admin' ? <StatCard label="Monthly payroll (net)" value={v.monthlyPayroll ? formatMoney(v.monthlyPayroll.net) : '—'} icon={<HRIcon name="wallet" size="md" color={c.info} />} trend={v.payrollTrend.map((p) => p.net)}
            delta={payDelta !== null ? { text: `${payDelta >= 0 ? '+' : ''}${payDelta.toFixed(1)}% vs previous month`, tone: 'neutral', dir: payDelta > 0 ? 'up' : payDelta < 0 ? 'down' : 'flat' } : undefined} sub={v.monthlyPayroll ? `Run: ${v.monthlyPayroll.period.slice(0, 7)}` : 'No payroll yet'} /> : null}
          <StatCard label="Training completion" value={`${v.trainingCompletion}%`} icon={<HRIcon name="training" size="md" color={c.accent} />} tone="accent" sub={`${tb.overdue} overdue`} />
        </Grid>
      )}

      <Grid min={isMobile ? 280 : 260} gap={10}>
        {!isStaff ? <QuickActionCard icon="employees" title="Add employee" description="Create a profile & login" href="/employees/new" /> : null}
        <QuickActionCard icon="calendar" title={isStaff ? 'Request leave' : 'Review leave'} description={isStaff ? 'Submit a new request' : `${v.pendingLeave} awaiting decision`} href="/leave" />
        <QuickActionCard icon="clock" title="Time & attendance" description="Clock in, breaks, weekly hours" href="/attendance" />
        {role === 'admin' ? <QuickActionCard icon="wallet" title="Run payroll" description="Process or approve a month" href="/payroll" /> : <QuickActionCard icon="training" title="My training" description="Update progress" href="/training" />}
      </Grid>

      {!isStaff ? <AttendanceOverview total={v.totalEmployees} present={v.presentToday} absent={v.absentToday} remote={v.remote} inOffice={v.inOffice}
        late={v.presentTrend.find((d) => d.date.slice(0, 10) === v.today.slice(0, 10))?.late ?? null} scopeLabel={role === 'manager' ? 'Team' : 'Employees'} /> : null}

      <Grid min={isMobile ? 280 : 420}>
        <ChartCard title="Hours & office mix" description={`Monday–Friday · ${isStaff ? 'my' : 'team'} actual vs scheduled hours`}
          summary={`This week: ${v.weekly.map((w, i) => `${WEEKDAYS_SHORT[i]} ${w.workedHours}h`).join(', ')} against 8h scheduled per day.`}>
          <BarChart labels={WEEKDAYS_SHORT} unit="h" series={[{ name: 'Scheduled', values: v.weekly.map((w) => w.scheduledHours), color: c.border }, { name: 'Actual', values: v.weekly.map((w) => w.workedHours), color: c.chart[0] }]} />
          <Divider />
          <T v="small" muted style={{ marginTop: 4, textAlign: 'center' }}>Office vs remote this week</T>
          <BarChart stacked height={170} labels={WEEKDAYS_SHORT} series={[{ name: 'In office', values: v.weekly.map((w) => w.office), color: c.chart[0] }, { name: 'Remote', values: v.weekly.map((w) => w.remote), color: c.chart[1] }, { name: 'On leave', values: v.weekly.map((w) => w.onLeave), color: c.chart[2] }]} />
        </ChartCard>
        {!isStaff ? (
          <ChartCard title="Attendance trend" description="Employees clocked in per working day" summary={`Peak ${Math.max(...trend.map((d) => d.present))} clocked in; latest ${trend[trend.length - 1]?.present ?? 0}.`}>
            <LineChart data={trend.map((d) => ({ x: dayLabel(d.date), y: d.present }))} config={{ height: 190, gradient: true, interactive: true, showYLabels: true, yAxisWidth: 28 }} />
            <T v="small" muted style={{ textAlign: 'center' }}>Office, remote &amp; late mix</T>
            <StackedAreaChart categories={['Office', 'Remote', 'Late']} colors={colors}
              data={trend.map((d, i) => ({ x: i, y: [Math.max(0, d.present - d.remote - d.late), d.remote, d.late], label: dayLabel(d.date) }))} config={{ height: 170 }} />
          </ChartCard>
        ) : (
          <ChartCard title="Weekly hours" description="Your progress towards the 40h week" summary={`${formatMinutes(v.me.workedMinutesThisWeek)} worked so far this week.`}>
            <View style={{ alignItems: 'center', padding: 8 }}><ProgressRingChart progress={Math.min(100, pct(v.me.workedMinutesThisWeek, 2400))} size={170} strokeWidth={14} centerText={formatMinutes(v.me.workedMinutesThisWeek)} label="of 40h" /></View>
          </ChartCard>
        )}
      </Grid>

      {!isStaff ? (
        <Grid min={isMobile ? 280 : 360}>
          <ChartCard title="Employee distribution" description="Active employees by department" summary={v.departments.map((d) => `${d.name} ${d.count}`).join(', ')}>
            <TreeMapChart data={v.departments.map((d, i) => ({ label: d.name, value: d.count, color: c.chart[i % c.chart.length] }))} config={{ height: 220 }} />
          </ChartCard>
          <ChartCard title="Training analytics" description="Assigned courses by status" summary={`${tb.completed} completed, ${tb.in_progress} in progress, ${tb.not_started} not started, ${tb.overdue} overdue.`}>
            <Row align="center" gap={20} wrap style={{ justifyContent: 'center' }}>
              <ProgressRingChart progress={v.trainingCompletion} size={140} strokeWidth={12} centerText={`${v.trainingCompletion}%`} label="completed" />
              <View style={{ gap: 8, flexGrow: 1, flexShrink: 1, minWidth: 150 }}>
                {([['completed', tb.completed], ['in_progress', tb.in_progress], ['not_started', tb.not_started], ['overdue', tb.overdue]] as const).map(([k, n]) => (
                  <Row key={k} style={{ justifyContent: 'space-between', minWidth: 0, flexGrow: 1 }}><Badge label={label(k)} tone={toneFor(k)} /><T v="h3">{n}</T></Row>))}
              </View>
            </Row>
          </ChartCard>
          {role === 'admin' && v.payrollTrend.length ? (
            <ChartCard title="Payroll trends" description="Gross vs net, last runs" summary={`Latest net ${formatMoney(v.payrollTrend[v.payrollTrend.length - 1].net)}; bonuses ${formatMoney(v.payrollTrend[v.payrollTrend.length - 1].bonuses)}, overtime ${formatMoney(v.payrollTrend[v.payrollTrend.length - 1].overtime)}.`}>
              <MultiLine labels={v.payrollTrend.map((p) => formatDate(p.period, { month: 'short' }))} format={(n) => formatMoney(n).replace(/\.00$/, '')} series={[{ name: 'Gross', values: v.payrollTrend.map((p) => p.gross) }, { name: 'Net', values: v.payrollTrend.map((p) => p.net) }]} />
              <BarChart stacked height={150} labels={v.payrollTrend.map((p) => formatDate(p.period, { month: 'short' }))} format={(n) => formatMoney(n).replace(/\.00$/, '')} series={[{ name: 'Bonuses', values: v.payrollTrend.map((p) => p.bonuses), color: c.chart[1] }, { name: 'Overtime', values: v.payrollTrend.map((p) => p.overtime), color: c.chart[2] }]} />
            </ChartCard>
          ) : null}
          <ChartCard title="Office vs remote today" summary={`${v.inOffice} in office, ${v.remote} remote.`}>
            <View style={{ alignItems: 'center' }}><DoughnutChart data={[{ label: 'In office', value: v.inOffice, color: c.chart[0] }, { label: 'Remote', value: v.remote, color: c.chart[1] }]} config={{ height: 200 }} /></View>
          </ChartCard>
        </Grid>
      ) : null}

      <Grid min={isMobile ? 280 : 380}>
        {!isStaff ? (
          <Card style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }} wrap><T v="h3" style={{ flexShrink: 1 }}>Pending approvals</T><Button small variant="ghost" title="Open" onPress={() => router.push('/leave' as never)} /></Row>
            <Row wrap><Badge label={`${v.pendingApprovals.leave.length} leave`} tone="warning" /><Badge label={`${v.pendingApprovals.overtime} overtime`} tone="warning" /><Badge label={`${v.pendingApprovals.corrections} corrections`} tone="warning" /></Row>
            {v.pendingApprovals.leave.length === 0 ? <T muted>No leave requests waiting.</T> : v.pendingApprovals.leave.map((l, i) => (
              <View key={l.id} style={{ gap: 8 }}>{i > 0 ? <Divider /> : null}
                <Row><Avatar name={l.employee} size={34} /><View style={{ flex: 1, minWidth: 0 }}><T v="h3">{l.employee}</T><T v="small" muted>{l.type} · {formatDate(l.startDate, { day: 'numeric', month: 'short' })} → {formatDate(l.endDate, { day: 'numeric', month: 'short' })} · {l.days}d</T></View><Badge label="Pending" tone="warning" /></Row>
              </View>))}
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }} wrap><T v="h3" style={{ flexShrink: 1 }}>My recent requests</T><Button small variant="ghost" title="All leave" onPress={() => router.push('/leave' as never)} /></Row>
            {v.myRequests.length === 0 ? <T muted>No leave requests yet.</T> : v.myRequests.map((r, i) => (
              <View key={r.id} style={{ gap: 8 }}>{i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1, minWidth: 0 }}><T v="h3">{r.type}</T><T v="small" muted>{formatDate(r.startDate)} → {formatDate(r.endDate)}</T></View><Badge label={label(r.status)} tone={toneFor(r.status)} /></Row>
              </View>))}
          </Card>
        )}
        <Card style={{ gap: 12 }}>
          <T v="h3">Recent activity</T>
          {v.recentActivity.length === 0 ? <T muted>Nothing yet today.</T> : v.recentActivity.map((a, i) => {
            const icon = ACTIVITY_ICONS[a.kind] ?? 'clock';
            const last = i === v.recentActivity.length - 1;
            return (
              <Row key={`${a.kind}-${i}`} align="flex-start" gap={12} wrap={false}>
                <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }}><HRIcon name={icon} size="sm" color={c.muted} /></View>
                  {last ? null : <View style={{ flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginTop: 4 }} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 14 }}>
                  <T v="body" style={{ fontWeight: '400' }}>{a.title}</T>
                  <T v="small" muted>{a.detail}</T>
                  <T v="small" muted>{new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</T>
                </View>
              </Row>
            );
          })}
        </Card>
      </Grid>
    </>
  );
}
