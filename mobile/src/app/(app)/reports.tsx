import { ReactNode, useMemo, useState } from 'react';
import { BarChart, HBarChart, LineChart, PieChart } from '@/components/charts';
import { AreaChart } from '@/components/charts/area-chart';
import { BubbleChart } from '@/components/charts/bubble-chart';
import { SankeyChart } from '@/components/charts/sankey-chart';
import { RadialBarChart } from '@/components/charts/radial-bar-chart';
import { StackedAreaChart } from '@/components/charts/stacked-area-chart';
import { TreeMapChart } from '@/components/charts/treemap-chart';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { Async, Banner, Button, Card, Chips, Grid, Row, Screen, SelectField, T, label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { addDays, formatMinutes, formatMoney, groupCount, minutesToHours, pct, startOfWeek, sum, effectiveTrainingStatus } from '@/lib/calc';
import { exportCSV, exportPDF, tableHtml } from '@/lib/export';
import { get } from '@/services/api';
import { formatDate, todayIn } from '@/lib/time';
import type { Application, AttendanceRecord, Benefit, EmployeeBenefit, LeaveRequest, Payroll, PayrollItem, TrainingAssignment, TrainingCourse } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { DateField, useDirectory, validDate } from '@/features/shared';

type Kind = 'headcount' | 'departments' | 'attendance' | 'hours' | 'location' | 'leave' | 'payroll' | 'recruitment' | 'training' | 'benefits';
const ALL: { value: Kind; label: string; admin?: boolean }[] = [
  { value: 'headcount', label: 'Headcount' }, { value: 'departments', label: 'Departments' }, { value: 'attendance', label: 'Attendance' },
  { value: 'hours', label: 'Hours & overtime' }, { value: 'location', label: 'Office vs remote' }, { value: 'leave', label: 'Leave & absence' },
  { value: 'payroll', label: 'Payroll', admin: true }, { value: 'recruitment', label: 'Recruitment', admin: true }, { value: 'training', label: 'Training' }, { value: 'benefits', label: 'Benefit costs', admin: true },
];

interface Dataset {
  employees: { id: string; employeeCode: string; fullName: string; jobTitle: string; departmentId: string | null; department: string | null; managerId: string | null; status: string; employmentType: string; startDate: string }[];
  attendance: AttendanceRecord[]; leave: LeaveRequest[]; training: TrainingAssignment[]; courses: TrainingCourse[]; benefits: Benefit[]; enrolments: EmployeeBenefit[];
  applications: Application[]; payroll: (Payroll)[];
}
interface Report { kpis: { label: string; value: string }[]; chart: ReactNode; columns: string[]; rows: (string | number)[][] }

export default function Reports() {
  const { role, settings } = useAuth();
  const { c: theme } = useTheme();
  const colors = theme.chart;
  const admin = role === 'admin';
  const today = todayIn(settings.timezone);
  const dir = useDirectory();
  const [kind, setKind] = useState<Kind>('headcount');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [dept, setDept] = useState(''); const [emp, setEmp] = useState(''); const [mgr, setMgr] = useState('');

  const data = useAsync(() => get<Dataset>('/reports/dataset', { from, to, departmentId: dept || undefined, managerId: mgr || undefined, employeeId: emp || undefined }), [from, to, dept, mgr, emp]);

  // The server already restricts everything to the caller's authority and the selected filters.
  const people = useMemo(() => data.data?.employees ?? [], [data.data]);
  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const managers = useMemo(() => { const s = new Set(dir.employees.map((e) => e.managerId).filter(Boolean) as string[]); return dir.employees.filter((e) => s.has(e.id)).map((e) => ({ value: e.id, label: e.fullName })); }, [dir.employees]);

  const report = useMemo<Report | null>(() => {
    const d = data.data; if (!d) return null;
    const active = people.filter((p) => p.status !== 'inactive');
    const att = d.attendance.filter((a) => ids.has(a.employeeId));
    const name = (id: string) => dir.empMap.get(id)?.fullName ?? '';
    const deptName = (id: string | null) => dir.depMap.get(id ?? '')?.name ?? 'Unassigned';
    switch (kind) {
      case 'headcount': {
        const by = groupCount(people, (e) => label(e.status));
        const types = groupCount(active, (e) => label(e.employmentType));
        return { kpis: [{ label: 'Total', value: String(people.length) }, { label: 'Active', value: String(active.length) }, { label: 'On leave', value: String(people.filter((p) => p.status === 'on_leave').length) }, { label: 'Inactive', value: String(people.filter((p) => p.status === 'inactive').length) }],
          chart: <Grid min={300}><Card><T v="h3">By status</T><PieChart data={Object.entries(by).map(([l, v]) => ({ label: l, value: v }))} /></Card><Card><T v="h3">By contract (active)</T><PieChart data={Object.entries(types).map(([l, v]) => ({ label: l, value: v }))} /></Card></Grid>,
          columns: ['Employee ID', 'Name', 'Title', 'Department', 'Status', 'Type', 'Start date'], rows: people.map((p) => [p.employeeCode, p.fullName, p.jobTitle, deptName(p.departmentId), label(p.status), label(p.employmentType), p.startDate]) };
      }
      case 'departments': {
        const by = groupCount(active, (e) => deptName(e.departmentId));
        // Real relationships only: organisation → department (from departmentId) → contract type (from employmentType).
        const pairs = groupCount(active, (e) => `${deptName(e.departmentId)}\u0000${label(e.employmentType)}`);
        const deptNodes = Object.keys(by), typeNodes = [...new Set(Object.keys(pairs).map((k) => k.split('\u0000')[1]))];
        const flow = active.length && deptNodes.length <= 10 ? <ChartCard title="Employee distribution" description="Organisation → department → contract type" summary={`${active.length} active employees across ${deptNodes.length} departments.`}>
          <SankeyChart nodes={[{ id: 'org', label: 'Organisation', column: 0 }, ...deptNodes.map((n) => ({ id: `d:${n}`, label: n, column: 1 })), ...typeNodes.map((n) => ({ id: `t:${n}`, label: n, column: 2 }))]}
            links={[...deptNodes.map((n) => ({ source: 'org', target: `d:${n}`, value: by[n] })), ...Object.entries(pairs).map(([k, v]) => { const [d, t] = k.split('\u0000'); return { source: `d:${d}`, target: `t:${t}`, value: v }; })]} />
        </ChartCard> : null;
        return { kpis: [{ label: 'Departments', value: String(Object.keys(by).length) }, { label: 'Largest', value: Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' }],
          chart: <Grid min={340}><ChartCard title="Headcount by department" description="Area is proportional to headcount" summary={Object.entries(by).map(([l, v]) => `${l} ${v}`).join(', ')}><TreeMapChart data={Object.entries(by).map(([l, v], i) => ({ label: l, value: v, color: colors[i % colors.length] }))} config={{ height: 240 }} /></ChartCard><Card><T v="h3">Ranking</T><HBarChart data={Object.entries(by).map(([l, v]) => ({ label: l, value: v }))} /></Card>{flow}</Grid>, columns: ['Department', 'Headcount'], rows: Object.entries(by) };
      }
      case 'attendance': {
        const counts = groupCount(att, (a) => label(a.status));
        const weeks = [...new Set(att.map((a) => startOfWeek(a.workDate)))].sort();
        const rate = pct(att.filter((a) => a.clockIn).length, att.filter((a) => a.status !== 'public_holiday' && a.status !== 'on_leave').length);
        return { kpis: [{ label: 'Attendance rate', value: `${rate}%` }, { label: 'Late arrivals', value: String(att.filter((a) => a.status === 'late').length) }, { label: 'Absences', value: String(att.filter((a) => a.status === 'absent').length) }],
          chart: <Grid min={320}><Card><T v="h3">Status mix</T><PieChart data={Object.entries(counts).map(([l, v]) => ({ label: l, value: v }))} /></Card>
            <ChartCard title="Attendance trend" description="Clocked-in days per week" summary={`${weeks.length} weeks shown.`}><AreaChart data={weeks.map((w) => ({ x: formatDate(w, { day: 'numeric', month: 'short' }), y: att.filter((a) => startOfWeek(a.workDate) === w && a.clockIn).length }))} config={{ height: 190, gradient: true, interactive: true, yAxisWidth: 32 }} /></ChartCard>
            <ChartCard title="Attendance categories" description="Weekly days by category" summary="Present, remote, late, on leave and absent days per week."><StackedAreaChart categories={['Present', 'Remote', 'Late', 'On leave', 'Absent']} colors={colors} data={weeks.map((w, i) => ({ x: i, y: (['present', 'remote', 'late', 'on_leave', 'absent'] as const).map((st) => att.filter((a) => startOfWeek(a.workDate) === w && a.status === st).length), label: formatDate(w, { day: 'numeric', month: 'short' }) }))} config={{ height: 200 }} /></ChartCard>
            <Card><T v="h3">Weekly attendance</T><LineChart labels={weeks.map((w) => formatDate(w, { day: 'numeric', month: 'short' }))} series={[{ name: 'Present', values: weeks.map((w) => att.filter((a) => startOfWeek(a.workDate) === w && a.clockIn).length) }, { name: 'Late', values: weeks.map((w) => att.filter((a) => startOfWeek(a.workDate) === w && a.status === 'late').length) }]} /></Card></Grid>,
          columns: ['Date', 'Employee', 'Status', 'Location', 'Clock in', 'Clock out', 'Worked', 'Late (min)'],
          rows: att.map((a) => [a.workDate, name(a.employeeId), label(a.status), a.workLocation ?? '', a.clockIn?.slice(11, 16) ?? '', a.clockOut?.slice(11, 16) ?? '', formatMinutes(a.workedMinutes), a.lateMinutes]) };
      }
      case 'hours': {
        const byEmp = people.map((p) => ({ label: p.fullName, v: sum(att.filter((a) => a.employeeId === p.id).map((a) => a.workedMinutes)), ot: sum(att.filter((a) => a.employeeId === p.id && a.overtimeStatus !== 'rejected').map((a) => a.overtimeMinutes)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 12);
        return { kpis: [{ label: 'Total hours', value: formatMinutes(sum(att.map((a) => a.workedMinutes))) }, { label: 'Overtime approved', value: formatMinutes(sum(att.filter((a) => a.overtimeStatus === 'approved').map((a) => a.overtimeMinutes))) }, { label: 'Overtime pending', value: formatMinutes(sum(att.filter((a) => a.overtimeStatus === 'pending').map((a) => a.overtimeMinutes))) }],
          chart: <Card><T v="h3">Hours worked vs overtime (top 12)</T><BarChart stacked unit="h" labels={byEmp.map((b) => b.label.split(' ')[0])} series={[{ name: 'Hours', values: byEmp.map((b) => minutesToHours(b.v - b.ot)) }, { name: 'Overtime', values: byEmp.map((b) => minutesToHours(b.ot)) }]} /></Card>,
          columns: ['Employee', 'Worked', 'Overtime'], rows: byEmp.map((b) => [b.label, formatMinutes(b.v), formatMinutes(b.ot)]) };
      }
      case 'location': {
        const w = att.filter((a) => a.clockIn); const o = w.filter((a) => a.workLocation === 'office').length; const r = w.filter((a) => a.workLocation === 'remote').length;
        const days = [...new Set(w.map((a) => a.workDate))].sort().slice(-14);
        return { kpis: [{ label: 'Office days', value: String(o) }, { label: 'Remote days', value: String(r) }, { label: 'Remote share', value: `${pct(r, o + r)}%` }],
          chart: <Grid min={320}><Card><T v="h3">Split</T><PieChart data={[{ label: 'In office', value: o }, { label: 'Remote', value: r }]} /></Card>
            <Card><T v="h3">Daily (last 14 days)</T><BarChart stacked labels={days.map((x) => x.slice(5))} series={[{ name: 'Office', values: days.map((x) => w.filter((a) => a.workDate === x && a.workLocation === 'office').length) }, { name: 'Remote', values: days.map((x) => w.filter((a) => a.workDate === x && a.workLocation === 'remote').length) }]} /></Card></Grid>,
          columns: ['Employee', 'Office days', 'Remote days'], rows: people.map((p) => [p.fullName, w.filter((a) => a.employeeId === p.id && a.workLocation === 'office').length, w.filter((a) => a.employeeId === p.id && a.workLocation === 'remote').length]) };
      }
      case 'leave': {
        const lv = d.leave.filter((l) => ids.has(l.employeeId) && l.status !== 'cancelled');
        const byType = [...new Map(lv.map((l) => [l.leaveTypeId, l.leaveType!])).values()].map((t) => ({ label: t.name, value: sum(lv.filter((l) => l.leaveTypeId === t.id && l.status === 'approved').map((l) => Number(l.workingDays))) })).filter((x) => x.value > 0);
        return { kpis: [{ label: 'Approved days', value: String(sum(lv.filter((l) => l.status === 'approved').map((l) => Number(l.workingDays)))) }, { label: 'Pending requests', value: String(lv.filter((l) => l.status === 'pending').length) }, { label: 'Absent days', value: String(att.filter((a) => a.status === 'absent').length) }],
          chart: <Card><T v="h3">Approved leave days by type</T><PieChart data={byType} /></Card>,
          columns: ['Employee', 'Type', 'From', 'To', 'Days', 'Status'], rows: lv.map((l) => [name(l.employeeId), l.leaveType?.name ?? '', l.startDate, l.endDate, l.workingDays, label(l.status)]) };
      }
      case 'payroll': {
        const runs = d.payroll.slice(-12); const tot = (id: string, f: keyof PayrollItem) => sum((runs.find((x) => x.id === id)?.items ?? []).map((i) => Number(i[f])));
        const lbl = runs.map((r) => formatDate(r.periodStart, { month: 'short', year: '2-digit' }));
        return { kpis: [{ label: 'Total gross', value: formatMoney(sum(runs.map((r) => tot(r.id, 'grossPay')))) }, { label: 'Total net', value: formatMoney(sum(runs.map((r) => tot(r.id, 'netPay')))) }, { label: 'Deductions', value: formatMoney(sum(runs.map((r) => tot(r.id, 'deductions')))) }],
          chart: <Card><T v="h3">Payroll expense trend</T><LineChart labels={lbl} format={(n) => formatMoney(n).replace(/\.00$/, '')} series={[{ name: 'Gross', values: runs.map((r) => tot(r.id, 'grossPay')) }, { name: 'Net', values: runs.map((r) => tot(r.id, 'netPay')) }]} /></Card>,
          columns: ['Period', 'Status', 'Gross', 'Deductions', 'Net'], rows: runs.map((r) => [r.periodStart.slice(0, 7), r.status, tot(r.id, 'grossPay'), tot(r.id, 'deductions'), tot(r.id, 'netPay')]) };
      }
      case 'recruitment': {
        const st = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'].map((s) => ({ label: label(s), value: d.applications.filter((a) => a.status === s).length }));
        return { kpis: [{ label: 'Applications', value: String(d.applications.length) }, { label: 'Hired', value: String(st[4].value) }, { label: 'Offer → hire', value: `${pct(st[4].value, st[3].value + st[4].value)}%` }],
          chart: <Grid min={340}><Card><T v="h3">Pipeline</T><HBarChart data={st} /></Card>
            <ChartCard title="Recruitment analysis" description="Per stage: candidates (height) and average rating (bubble size)" summary={st.slice(0, 5).map((x) => `${x.label} ${x.value}`).join(', ')}>
              <BubbleChart data={['applied', 'screening', 'interview', 'offered', 'hired'].map((stg, i) => { const rs = d.applications.filter((a) => a.status === stg); const rated = rs.filter((a) => a.rating); return { x: i + 1, y: rs.length, size: rated.length ? Math.round((sum(rated.map((a) => a.rating ?? 0)) / rated.length) * 10) : 5, label: label(stg), color: colors[i % colors.length] }; })} config={{ height: 220 }} />
            </ChartCard></Grid>, columns: ['Stage', 'Candidates'], rows: st.map((s) => [s.label, s.value]) };
      }
      case 'training': {
        const tr = d.training.filter((t) => ids.has(t.employeeId)).map((t) => ({ ...t, eff: effectiveTrainingStatus(t, today) }));
        return { kpis: [{ label: 'Completion', value: `${pct(tr.filter((t) => t.eff === 'completed').length, tr.length)}%` }, { label: 'Overdue', value: String(tr.filter((t) => t.eff === 'overdue').length) }, { label: 'Assignments', value: String(tr.length) }],
          chart: <ChartCard title="Completion by course" description="Percent of assignments completed" summary="Each ring shows one course's completion rate."><RadialBarChart data={d.courses.map((cc, i) => { const rr = tr.filter((t) => t.trainingId === cc.id); return { label: cc.title, value: pct(rr.filter((t) => t.eff === 'completed').length, rr.length), color: colors[i % colors.length] }; })} config={{ padding: 16 }} /></ChartCard>,
          columns: ['Employee', 'Course', 'Due', 'Progress', 'Status'], rows: tr.map((t) => [name(t.employeeId), d.courses.find((c) => c.id === t.trainingId)?.title ?? '', t.dueDate, `${t.progress}%`, label(t.eff)]) };
      }
      case 'benefits': {
        const eb = d.enrolments.filter((e) => e.status === 'enrolled' && ids.has(e.employeeId));
        const byB = d.benefits.map((b) => ({ label: b.name, value: sum(eb.filter((e) => e.benefitId === b.id).map((e) => Number(e.monthlyCost))) })).filter((x) => x.value > 0);
        return { kpis: [{ label: 'Monthly cost', value: formatMoney(sum(byB.map((b) => b.value))) }, { label: 'Annualised', value: formatMoney(sum(byB.map((b) => b.value)) * 12) }, { label: 'Enrolments', value: String(eb.length) }],
          chart: <Card><T v="h3">Monthly cost by benefit</T><PieChart format={(n) => formatMoney(n)} data={byB} /></Card>, columns: ['Benefit', 'Monthly cost'], rows: byB.map((b) => [b.label, b.value]) };
      }
    }
  }, [data.data, kind, people, ids, dir.empMap, dir.depMap, today, colors]);

  const title = ALL.find((a) => a.value === kind)?.label ?? '';
  const rangeOk = validDate(from) && validDate(to) && from <= to;

  return (
    <Screen title="Reports & Analytics" subtitle={role === 'manager' ? 'Scoped to your team' : 'Company-wide'}>
      <Card style={{ gap: 12 }}>
        <Chips value={kind} onChange={setKind} options={ALL.filter((a) => !a.admin || admin).map(({ value, label: l }) => ({ value, label: l }))} />
        <Row wrap align="flex-start">
          <DateField label="From" value={from} onChange={setFrom} /><DateField label="To" value={to} onChange={setTo} />
        </Row>
        <Row wrap gap={6}>{[7, 30, 90].map((n) => <Button key={n} small variant="secondary" title={`Last ${n} days`} onPress={() => { setFrom(addDays(today, -(n - 1))); setTo(today); }} />)}</Row>
        <Row wrap align="flex-start">
          <SelectField label="Department" value={dept} onChange={setDept} allowClear placeholder="All" options={dir.departments.map((x) => ({ value: x.id, label: x.name }))} />
          {admin ? <SelectField label="Manager" value={mgr} onChange={setMgr} allowClear placeholder="All" options={managers} /> : null}
          <SelectField label="Employee" value={emp} onChange={setEmp} allowClear placeholder="All" options={dir.employees.map((x) => ({ value: x.id, label: x.fullName }))} />
        </Row>
        {!rangeOk ? <Banner tone="danger">Enter a valid date range (From must not be after To).</Banner> : null}
      </Card>
      <Async state={{ ...data, data: report, loading: data.loading || dir.loading, error: data.error ?? dir.error }}>
        {(r) => <ReportBody r={r} title={title} kind={kind} range={`${formatDate(from)} – ${formatDate(to)}`} />}
      </Async>
    </Screen>
  );
}

function ReportBody({ r, title, kind, range }: { r: Report; title: string; kind: string; range: string }) {
  const [busy, setBusy] = useState(false);
  const csv = async () => {
    setBusy(true);
    try { await exportCSV(`${kind}-report`, r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))); } finally { setBusy(false); }
  };
  return (
    <>
      <Row style={{ justifyContent: 'space-between' }} wrap><T v="h2">{title}</T>
        <Row><Button small variant="secondary" title="Export CSV" loading={busy} onPress={csv} />
          <Button small variant="secondary" title="Export PDF" onPress={() => exportPDF(tableHtml(`${title} report`, range, r.columns, r.rows), `${kind}-report`)} /></Row></Row>
      <Grid min={170}>{r.kpis.map((k) => <Card key={k.label} style={{ gap: 4 }}><T v="small" muted style={{ fontWeight: '400' }}>{k.label}</T><T style={{ fontSize: 24, fontWeight: '400' }}>{k.value}</T></Card>)}</Grid>
      {r.chart}
      <T v="small" muted>{r.rows.length} row(s) in export.</T>
    </>
  );
}
