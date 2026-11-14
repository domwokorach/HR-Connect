import { FileText } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { ProgressRingChart } from '@/components/charts/progress-ring-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Async, Badge, Button, Card, Divider, EmptyState, Grid, ProgressBar, Row, StatCard, T, label, toneFor } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, effectiveTrainingStatus, formatMinutes, formatMoney, leaveRemaining, pct } from '@/lib/calc';
import { useTheme } from '@/lib/theme';
import { formatDate, shortTime, todayIn } from '@/lib/time';
import type { AttendanceRecord, Benefit, Employee, EmployeeBenefit, LeaveBalance, LeaveRequest, Payslip, TrainingAssignment, WorkSchedule } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { get, openFile } from '@/services/api';
import { HRIcon } from '@/components/ui/hr-icon';

export type Detail = Employee & { balances?: (LeaveBalance & { leaveType: { name: string } })[]; trainings?: Pick<TrainingAssignment, 'status' | 'progress' | 'dueDate'>[] };

function Info({ k, v }: { k: string; v: string }) {
  return <View style={{ gap: 2 }}><T v="label" muted>{k}</T><T>{v}</T></View>;
}

/** Profile tabs. Tabs that expose private data (payroll, benefits, personal info) only appear for HR and the employee themself; the API enforces it as well. */
export function ProfileTabs({ e, managerName, schedule, timezone, onEdit, canEdit }: { e: Detail; managerName: string; schedule?: WorkSchedule; timezone: string; onEdit: () => void; canEdit: boolean }) {
  const { role, employee } = useAuth();
  const [tab, setTab] = useState('overview');
  const admin = role === 'admin';
  const self = employee?.id === e.id;
  const canSee = admin || self;
  const lead = role !== 'staff';
  const tabs = [
    ['overview', 'Overview'], ['personal', 'Personal'], ['employment', 'Employment'],
    ...(lead || self ? [['attendance', 'Attendance'], ['leave', 'Leave'], ['training', 'Training']] : []),
    ...(canSee ? [['payroll', 'Payroll'], ['benefits', 'Benefits']] : []),
    ...(lead || self ? [['documents', 'Documents']] : []),
  ] as [string, string][];

  return (
    <Tabs value={tab} onValueChange={setTab} enableSwipe={false} haptic={false}>
      <TabsList>{tabs.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
      <View style={{ height: 12 }} />
      <TabsContent value="overview"><Overview e={e} timezone={timezone} /></TabsContent>
      <TabsContent value="personal">
        <Card style={{ gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}><T v="h3">Personal information</T>{canEdit ? <Button small variant="secondary" title="Edit" onPress={onEdit} /> : null}</Row>
          <Grid min={240}><Info k="Full name" v={e.fullName} /><Info k="Email" v={e.email} />
            {e.phone !== undefined ? <Info k="Phone" v={e.phone || '—'} /> : null}{e.homeAddress !== undefined ? <Info k="Home address" v={e.homeAddress || '—'} /> : null}</Grid>
          {e.phone === undefined ? <T v="small" muted>Private contact details are visible to HR and the employee only.</T> : <Badge label="Confidential" tone="accent" />}
        </Card>
      </TabsContent>
      <TabsContent value="employment">
        <Card style={{ gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}><T v="h3">Employment details</T>{admin ? <Button small variant="secondary" title="Edit" onPress={onEdit} /> : null}</Row>
          <Grid min={240}>
            <Info k="Employee ID" v={e.employeeCode} /><Info k="Job title" v={e.jobTitle || '—'} /><Info k="Department" v={e.department?.name ?? '—'} /><Info k="Manager" v={managerName} />
            <Info k="Employment type" v={label(e.employmentType)} /><Info k="Start date" v={formatDate(e.startDate)} /><Info k="Country" v={e.country} />
            <Info k="Work schedule" v={schedule ? `${shortTime(schedule.startTime)}–${shortTime(schedule.endTime)}, ${schedule.workDays.length} days/week` : '—'} />
            {e.salary !== undefined ? <Info k="Salary" v={`${formatMoney(e.salary, e.currency)} / year`} /> : null}
          </Grid>
          <Row><Badge label={label(e.status)} tone={toneFor(e.status)} />{admin ? <Badge label={e.hasLogin ? `Login: ${e.loginRole ?? ''}` : 'No login'} tone={e.hasLogin ? 'primary' : 'neutral'} /> : null}</Row>
        </Card>
      </TabsContent>
      <TabsContent value="attendance"><AttendanceTab id={e.id} self={self} timezone={timezone} /></TabsContent>
      <TabsContent value="leave"><LeaveTab id={e.id} balances={e.balances ?? []} /></TabsContent>
      <TabsContent value="training"><TrainingTab id={e.id} timezone={timezone} /></TabsContent>
      <TabsContent value="payroll"><PayrollTab id={e.id} self={self} /></TabsContent>
      <TabsContent value="benefits"><BenefitsTab id={e.id} /></TabsContent>
      <TabsContent value="documents"><DocumentsTab id={e.id} /></TabsContent>
    </Tabs>
  );
}

function Overview({ e, timezone }: { e: Detail; timezone: string }) {
  const { c } = useTheme();
  const today = todayIn(timezone);
  const trainings = e.trainings ?? [];
  const done = trainings.filter((t) => effectiveTrainingStatus(t, today) === 'completed').length;
  const annual = e.balances?.find((b) => b.leaveType.name === 'Annual Leave') ?? e.balances?.[0];
  return (
    <Grid min={220}>
      <StatCard label="Leave remaining" value={annual ? leaveRemaining(annual) : '—'} sub={annual ? annual.leaveType.name : 'Not visible to you'} icon={<HRIcon name="calendar" size="md" color={c.success} />} tone="success" />
      <StatCard label="Training completed" value={`${done}/${trainings.length}`} sub={`${pct(done, trainings.length)}% complete`} icon={<HRIcon name="training" size="md" color={c.accent} />} tone="accent" />
      <StatCard label="Employment" value={label(e.employmentType)} sub={`Since ${formatDate(e.startDate)}`} icon={<HRIcon name="clock" size="md" color={c.info} />} />
    </Grid>
  );
}

function AttendanceTab({ id, self, timezone }: { id: string; self: boolean; timezone: string }) {
  const today = todayIn(timezone);
  const from = addDays(today, -14);
  const data = useAsync(() => (self ? get<AttendanceRecord[]>('/attendance/me', { from, to: today }) : get<AttendanceRecord[]>('/attendance/team', { from, to: today, employeeId: id })), [id]);
  return (
    <Async state={data} empty={(d) => d.length === 0}>
      {(rows) => {
        const worked = rows.reduce((s, r) => s + r.workedMinutes, 0);
        const sched = rows.reduce((s, r) => s + r.scheduledMinutes, 0);
        return (
          <Card style={{ gap: 12 }}>
            <Row gap={20} wrap>
              <ProgressRingChart progress={Math.min(100, pct(worked, sched || 1))} size={110} strokeWidth={10} centerText={formatMinutes(worked)} label="14 days" />
              <View style={{ flex: 1, minWidth: 200, gap: 4 }}><T v="h3">Last 14 days</T><T muted>{rows.filter((r) => r.status === 'late').length} late · {rows.filter((r) => r.status === 'absent').length} absent · {formatMinutes(rows.reduce((s, r) => s + r.overtimeMinutes, 0))} overtime</T></View>
            </Row>
            <Divider />
            {rows.slice(0, 10).map((r) => (
              <Row key={r.id} style={{ justifyContent: 'space-between' }} wrap>
                <View><T v="h3">{formatDate(r.workDate, { weekday: 'short', day: 'numeric', month: 'short' })}</T><T v="small" muted>{r.workLocation ? label(r.workLocation) : '—'} · {formatMinutes(r.workedMinutes)}</T></View>
                <Badge label={label(r.status)} tone={toneFor(r.status)} />
              </Row>))}
          </Card>
        );
      }}
    </Async>
  );
}

function LeaveTab({ id, balances }: { id: string; balances: (LeaveBalance & { leaveType: { name: string } })[] }) {
  const { c } = useTheme();
  const data = useAsync(() => get<LeaveRequest[]>('/leaves'), [id]);
  return (
    <View style={{ gap: 12 }}>
      <Grid min={200}>{balances.map((b) => <StatCard key={b.id} label={b.leaveType.name} value={leaveRemaining(b)} sub={`${b.used} used of ${b.entitled}`} icon={<HRIcon name="calendar" size="md" color={c.info} />} />)}</Grid>
      <Async state={data}>
        {(all) => {
          const rows = all.filter((r) => r.employeeId === id);
          return rows.length === 0 ? <Card><EmptyState title="No leave requests" /></Card> : (
            <Card style={{ gap: 10 }}>
              {rows.map((r, i) => (
                <View key={r.id} style={{ gap: 8 }}>{i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between' }} wrap><View><T v="h3">{r.leaveType?.name}</T><T v="small" muted>{formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.workingDays} day(s)</T></View><Badge label={label(r.status)} tone={toneFor(r.status)} /></Row>
                </View>))}
            </Card>
          );
        }}
      </Async>
    </View>
  );
}

function TrainingTab({ id, timezone }: { id: string; timezone: string }) {
  const today = todayIn(timezone);
  const data = useAsync(() => get<{ assignments: TrainingAssignment[] }>('/training'), [id]);
  return (
    <Async state={data}>
      {({ assignments }) => {
        const rows = assignments.filter((a) => a.employeeId === id);
        return rows.length === 0 ? <Card><EmptyState title="No training assigned" /></Card> : (
          <Card style={{ gap: 12 }}>
            {rows.map((a, i) => { const eff = effectiveTrainingStatus(a, today); return (
              <View key={a.id} style={{ gap: 6 }}>{i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between' }} wrap><View><T v="h3">{a.training?.title}</T><T v="small" muted>Due {formatDate(a.dueDate)}{a.completionDate ? ` · completed ${formatDate(a.completionDate)}` : ''}</T></View><Badge label={label(eff)} tone={toneFor(eff)} /></Row>
                <Row><View style={{ flex: 1 }}><ProgressBar value={a.progress} /></View><T v="small" muted>{a.progress}%</T></Row>
              </View>); })}
          </Card>
        );
      }}
    </Async>
  );
}

function PayrollTab({ id, self }: { id: string; self: boolean }) {
  const data = useAsync(() => get<Payslip[]>(self ? '/payroll/payslips/me' : `/payroll/payslips/employee/${id}`), [id]);
  return (
    <Async state={data} empty={(d) => d.length === 0}>
      {(rows) => (
        <Card style={{ gap: 10 }}>
          <T v="h3">Payslip history</T>
          {rows.map((p, i) => (
            <View key={p.id} style={{ gap: 8 }}>{i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <View><T v="h3">{formatDate(p.periodStart, { month: 'long', year: 'numeric' })}</T><T v="small" muted>Gross {formatMoney(p.grossPay)} · deductions {formatMoney(p.deductions)}</T></View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><T v="h3">{formatMoney(p.netPay)}</T><Badge label={label(p.paymentStatus)} tone={toneFor(p.paymentStatus)} /></View>
              </Row>
            </View>))}
        </Card>
      )}
    </Async>
  );
}

function BenefitsTab({ id }: { id: string }) {
  const data = useAsync(() => get<{ benefits: Benefit[]; enrolments: EmployeeBenefit[] }>('/benefits'), [id]);
  return (
    <Async state={data}>
      {({ benefits, enrolments }) => {
        const rows = enrolments.filter((x) => x.employeeId === id);
        return rows.length === 0 ? <Card><EmptyState title="No benefits assigned" /></Card> : (
          <Grid min={240}>{rows.map((r) => { const b = benefits.find((x) => x.id === r.benefitId); return (
            <Card key={r.id} style={{ gap: 6 }}><Row style={{ justifyContent: 'space-between' }}><T v="h3">{b?.name}</T><Badge label={label(r.status)} tone={toneFor(r.status)} /></Row><T v="small" muted>{b?.description}</T><T v="small" muted>{formatMoney(Number(r.monthlyCost))}/month · since {formatDate(r.startDate)}</T></Card>); })}</Grid>
        );
      }}
    </Async>
  );
}

function DocumentsTab({ id }: { id: string }) {
  const data = useAsync(() => get<{ id: string; name: string; kind: string; size: number; createdAt: string }[]>(`/employees/${id}/documents`), [id]);
  return (
    <Async state={data} empty={(d) => d.length === 0}>
      {(rows) => (
        <Card style={{ gap: 10 }}>
          {rows.map((d, i) => (
            <View key={d.id} style={{ gap: 8 }}>{i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Row><FileText size={18} color="#64748B" /><View style={{ flex: 1, minWidth: 0 }}><T v="h3">{d.name}</T><T v="small" muted>{d.kind} · {(d.size / 1024).toFixed(0)} KB · {formatDate(d.createdAt.slice(0, 10))}</T></View></Row>
                <Button small variant="secondary" title="Open" onPress={() => openFile(d.id)} />
              </Row>
            </View>))}
        </Card>
      )}
    </Async>
  );
}
