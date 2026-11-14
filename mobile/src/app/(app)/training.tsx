import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarChart } from '@/components/charts';
import { ProgressRingChart } from '@/components/charts/progress-ring-chart';
import { Async, Badge, Banner, Button, Card, Divider, Field, Grid, ProgressBar, Row, Screen, Section, SelectField, Sheet, StatCard, T, label, toneFor } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { effectiveTrainingStatus, pct } from '@/lib/calc';
import { get, patch, post } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { formatDate, todayIn } from '@/lib/time';
import type { TrainingAssignment, TrainingCourse } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { DateField, errMsg, useDirectory, useScope, validDate } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';

export default function Training() {
  const { role, employee, settings } = useAuth();
  const { c } = useTheme();
  const today = todayIn(settings.timezone);
  const dir = useDirectory();
  const scope = useScope(dir.employees);
  const lead = role !== 'staff';
  const [assignOpen, setAssignOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const data = useAsync(async () => {
    return get<{ courses: TrainingCourse[]; assignments: TrainingAssignment[] }>('/training');
  }, []);

  const rows = useMemo(() => (data.data?.assignments ?? []).map((a) => ({ ...a, eff: effectiveTrainingStatus(a, today) })), [data.data, today]);
  const mine = rows.filter((r) => r.employeeId === employee?.id);
  const teamRows = lead ? rows.filter((r) => r.employeeId !== employee?.id) : [];
  const stat = (xs: typeof rows) => ({ total: xs.length, done: xs.filter((x) => x.eff === 'completed').length, prog: xs.filter((x) => x.eff === 'in_progress').length, over: xs.filter((x) => x.eff === 'overdue').length, ns: xs.filter((x) => x.eff === 'not_started').length });
  const overall = stat(lead ? rows : mine);

  const progress = async (id: string, p: number) => {
    setErr(null);
    try { await patch(`/training/assignments/${id}/progress`, { progress: p }); data.reload(); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Screen title="Training" subtitle="Courses, assignments and completion"
      actions={lead ? <Row><Button small variant="secondary" title="New course" onPress={() => setCourseOpen(true)} /><Button title="Assign training" icon={<Plus size={16} color="#fff" />} onPress={() => setAssignOpen(true)} /></Row> : null}>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Async state={{ ...data, loading: data.loading || dir.loading }}>
        {(d) => {
          const course = (id: string) => d.courses.find((x) => x.id === id);
          return (
            <>
              <Grid min={180}>
                <StatCard label="Completion rate" value={`${pct(overall.done, overall.total)}%`} icon={<HRIcon name="training" size="md" color={c.primary} />} />
                <StatCard label="Completed" value={overall.done} icon={<HRIcon name="completed" size="md" color={c.success} />} tone="success" />
                <StatCard label="In progress" value={overall.prog} icon={<HRIcon name="inProgress" size="md" color={c.info} />} tone="info" />
                <StatCard label="Overdue" value={overall.over} icon={<HRIcon name="overdue" size="md" color={c.danger} />} tone="danger" />
              </Grid>
              <Grid min={320}>
                <Card style={{ gap: 12 }}><T v="h3">Completion</T>
                  <Row gap={20} wrap style={{ justifyContent: 'center' }}>
                    <ProgressRingChart progress={pct(overall.done, overall.total)} size={140} strokeWidth={12} centerText={`${pct(overall.done, overall.total)}%`} label="completed" />
                    <View style={{ gap: 8 }}>{([['completed', overall.done], ['in_progress', overall.prog], ['not_started', overall.ns], ['overdue', overall.over]] as const).map(([k, n]) => <Row key={k} style={{ justifyContent: 'space-between', minWidth: 190 }}><Badge label={label(k)} tone={toneFor(k)} /><T v="h3">{n}</T></Row>)}</View>
                  </Row></Card>
                <Card style={{ gap: 8 }}><T v="h3">Completion by course</T>
                  <BarChart labels={d.courses.map((x) => x.title)} unit="%" series={[{ name: 'Completion', values: d.courses.map((x) => { const r = (lead ? rows : mine).filter((a) => a.trainingId === x.id); return pct(r.filter((a) => a.eff === 'completed').length, r.length); }), color: c.chart[1] }]} /></Card>
              </Grid>

              <Section title="My training">
                <Card pad={false}>
                  {mine.length === 0 ? <T muted style={{ padding: 16 }}>No training assigned to you.</T> : mine.map((a, i) => (
                    <View key={a.id}>{i > 0 ? <Divider /> : null}
                      <View style={{ padding: 14, gap: 8 }}>
                        <Row style={{ justifyContent: 'space-between' }}><View style={{ flexShrink: 1 }}><T v="h3">{course(a.trainingId)?.title}</T><T v="small" muted>{course(a.trainingId)?.code} · due {formatDate(a.dueDate)}{a.completionDate ? ` · completed ${formatDate(a.completionDate)}` : ''}</T></View><Badge label={label(a.eff === 'overdue' ? 'overdue' : a.eff)} tone={toneFor(a.eff)} /></Row>
                        <Row><View style={{ flex: 1 }}><ProgressBar value={a.progress} color={a.eff === 'overdue' ? c.danger : c.primary} /></View><T v="small" muted>{a.progress}%</T></Row>
                        {a.eff !== 'completed' ? <Row wrap>{[25, 50, 75, 100].map((p) => <Button key={p} small variant={p === 100 ? 'success' : 'secondary'} title={p === 100 ? 'Mark complete' : `${p}%`} onPress={() => progress(a.id, p)} />)}</Row> : null}
                      </View>
                    </View>))}
                </Card>
              </Section>

              {lead ? (
                <Section title={role === 'admin' ? 'All assignments' : 'Team assignments'}>
                  <Card pad={false}>
                    {teamRows.length === 0 ? <T muted style={{ padding: 16 }}>No assignments yet.</T> : teamRows.slice(0, 60).map((a, i) => (
                      <View key={a.id}>{i > 0 ? <Divider /> : null}
                        <View style={{ padding: 12, gap: 6 }}>
                          <Row style={{ justifyContent: 'space-between' }} wrap>
                            <View style={{ flexShrink: 1 }}><T v="h3">{dir.empMap.get(a.employeeId)?.fullName} · {course(a.trainingId)?.title}</T>
                              <T v="small" muted>{dir.depMap.get(dir.empMap.get(a.employeeId)?.departmentId ?? '')?.name ?? '—'} · assigned {formatDate(a.assignedDate)} · due {formatDate(a.dueDate)}</T></View>
                            <Badge label={label(a.eff)} tone={toneFor(a.eff)} />
                          </Row>
                          <Row><View style={{ flex: 1 }}><ProgressBar value={a.progress} /></View><T v="small" muted>{a.progress}%</T></Row>
                        </View>
                      </View>))}
                  </Card>
                </Section>
              ) : null}

              <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} courses={d.courses} people={scope.filter((s) => s.id !== employee?.id || role === 'admin')} onDone={() => { setAssignOpen(false); data.reload(); }} />
              <CourseSheet open={courseOpen} onClose={() => setCourseOpen(false)} onDone={() => { setCourseOpen(false); data.reload(); }} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function AssignSheet({ open, onClose, courses, people, onDone }: { open: boolean; onClose: () => void; courses: TrainingCourse[]; people: { id: string; fullName: string; jobTitle: string }[]; onDone: () => void }) {
  const [course, setCourse] = useState(''); const [emp, setEmp] = useState(''); const [due, setDue] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!course || !emp) return setErr('Choose a course and an employee.');
    if (!validDate(due)) return setErr('Enter a due date (YYYY-MM-DD).');
    setBusy(true); setErr(null);
    try { await post('/training/assign', { trainingId: course, employeeId: emp, dueDate: due }); setCourse(''); setEmp(''); setDue(''); onDone(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Sheet visible={open} onClose={onClose} title="Assign training">
      <SelectField label="Course" value={course} onChange={setCourse} options={courses.map((c) => ({ value: c.id, label: c.title }))} />
      <SelectField label="Employee" value={emp} onChange={setEmp} options={people.map((p) => ({ value: p.id, label: p.fullName, sub: p.jobTitle }))} />
      <DateField label="Due date" value={due} onChange={setDue} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Assign" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function CourseSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [hours, setHours] = useState('1');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return setErr('Title is required.');
    const h = Number(hours); if (!(h > 0)) return setErr('Duration must be positive.');
    try { await post('/training/courses', { title: title.trim(), description: desc || null, durationHours: h }); setTitle(''); setDesc(''); onDone(); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={open} onClose={onClose} title="New course">
      <Field label="Title" value={title} onChangeText={setTitle} /><Field label="Description" value={desc} onChangeText={setDesc} multiline />
      <Field label="Duration (hours)" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Create course" onPress={submit} />
    </Sheet>
  );
}
