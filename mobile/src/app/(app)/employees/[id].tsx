import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ProfileTabs, type Detail } from '@/components/employees/ProfileTabs';
import { Async, Avatar, Badge, Banner, Button, Card, Chips, ConfirmDialog, Field, Grid, Row, Screen, SelectField, Sheet, T, label, toneFor } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { shortTime } from '@/lib/time';
import type { Employee, EmploymentType, WorkSchedule } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { del, get, patch, post } from '@/services/api';
import { DateField, errMsg, useDirectory, validDate } from '@/features/shared';

const TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full time' }, { value: 'part_time', label: 'Part time' }, { value: 'contract', label: 'Contract' }, { value: 'intern', label: 'Intern' },
];
type LoginRole = 'ADMIN' | 'MANAGER' | 'STAFF';

interface Form {
  fullName: string; email: string; jobTitle: string; departmentId: string; managerId: string; employmentType: EmploymentType; startDate: string;
  status: Employee['status']; scheduleId: string; country: string; phone: string; homeAddress: string; salary: string; loginPassword: string; loginRole: LoginRole;
}
const blank: Form = { fullName: '', email: '', jobTitle: '', departmentId: '', managerId: '', employmentType: 'full_time', startDate: new Date().toISOString().slice(0, 10), status: 'active', scheduleId: '', country: 'GB', phone: '', homeAddress: '', salary: '', loginPassword: '', loginRole: 'STAFF' };


export default function EmployeeDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { role, employee: me, settings } = useAuth();
  const router = useRouter();
  const dir = useDirectory();
  const isNew = id === 'new';
  const admin = role === 'admin';
  const isSelf = me?.id === id;
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState(isNew || edit === '1');
  const [leaveAsk, setLeaveAsk] = useState(false);
  const pendingExit = useRef<() => void>(() => {});
  const [initial, setInitial] = useState<string>(JSON.stringify(blank));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const data = useAsync(async () => {
    const [e, sch] = await Promise.all([isNew ? Promise.resolve(null) : get<Detail>(`/employees/${id}`), get<WorkSchedule[]>('/schedules')]);
    return { e, sch };
  }, [id]);

  // Fill the form once per loaded record (derived during render rather than in an effect).
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  if (data.data?.e && loadedFor !== data.data) {
    const e = data.data.e;
    setLoadedFor(data.data);
    setInitial(JSON.stringify({ fullName: e.fullName, email: e.email, jobTitle: e.jobTitle, departmentId: e.departmentId ?? '', managerId: e.managerId ?? '', employmentType: e.employmentType, startDate: e.startDate, status: e.status, scheduleId: e.scheduleId ?? '', country: e.country, phone: e.phone ?? '', homeAddress: e.homeAddress ?? '', salary: e.salary !== undefined ? String(e.salary) : '', loginPassword: '', loginRole: e.loginRole ?? 'STAFF' }));
    setForm({ fullName: e.fullName, email: e.email, jobTitle: e.jobTitle, departmentId: e.departmentId ?? '', managerId: e.managerId ?? '', employmentType: e.employmentType, startDate: e.startDate, status: e.status, scheduleId: e.scheduleId ?? '', country: e.country, phone: e.phone ?? '', homeAddress: e.homeAddress ?? '', salary: e.salary !== undefined ? String(e.salary) : '', loginPassword: '', loginRole: e.loginRole ?? 'STAFF' });
  }

  const reloadAll = () => { data.reload(); dir.reload(); };

  const save = async () => {
    if (!form.fullName.trim()) return setErr('Full name is required.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErr('Enter a valid email address.');
    if (!validDate(form.startDate)) return setErr('Start date must be YYYY-MM-DD.');
    const salary = form.salary === '' ? 0 : Number(form.salary);
    if (Number.isNaN(salary) || salary < 0) return setErr('Salary must be a positive number.');
    if (isNew && form.loginPassword && form.loginPassword.length < 10) return setErr('Login password must be at least 10 characters (upper, lower, digit).');
    setBusy(true); setErr(null);
    try {
      const row = {
        fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), jobTitle: form.jobTitle.trim(), departmentId: form.departmentId || null, managerId: form.managerId || null,
        employmentType: form.employmentType, startDate: form.startDate, status: form.status, scheduleId: form.scheduleId || null, country: form.country.trim().toUpperCase() || 'GB',
        phone: form.phone || null, homeAddress: form.homeAddress || null, salary,
      };
      if (isNew) {
        const created = await post<{ id: string }>('/employees', { ...row, ...(form.loginPassword ? { login: { password: form.loginPassword, role: form.loginRole } } : {}) });
        dir.reload();
        router.replace(`/employees/${created.id}` as never);
      } else {
        await patch(`/employees/${id}`, { ...row, ...(data.data?.e?.hasLogin ? { loginRole: form.loginRole } : {}) });
        setEditing(false); reloadAll();
      }
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  /** Staff editing themself may only change phone and address; the server enforces it too. */
  const saveSelf = async () => {
    setBusy(true); setErr(null);
    try { await patch(`/employees/${id}`, { phone: form.phone || null, homeAddress: form.homeAddress || null }); setEditing(false); reloadAll(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const setStatus = async (status: Employee['status']) => {
    setBusy(true);
    try { if (status === 'inactive') await del(`/employees/${id}`); else await patch(`/employees/${id}`, { status }); reloadAll(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false); setConfirm(false);
  };

  const viewData = data.data;
  const managerChoices = dir.employees.filter((e) => e.id !== id && e.status !== 'inactive').map((e) => ({ value: e.id, label: e.fullName, sub: e.jobTitle }));
  const e0 = viewData?.e;
  const selfEdit = !admin && isSelf && editing;
  const dirty = editing && JSON.stringify(form) !== initial;
  /** Leaving the editor: ask first if there are unsaved changes. */
  const requestExit = (action: () => void) => { if (dirty) { pendingExit.current = action; setLeaveAsk(true); } else action(); };

  return (
    <Screen title={isNew ? 'New employee' : e0?.fullName ?? 'Employee'} subtitle={isNew ? 'Employee ID is generated automatically' : e0 ? `${e0.employeeCode} · ${e0.jobTitle || 'No title'}` : ''}
      actions={<Row>
        <Button small variant="secondary" title="‹ Back" onPress={() => requestExit(() => router.back())} />
        {(admin || isSelf) && !isNew && !editing ? <Button small title={admin ? 'Edit' : 'Edit contact details'} onPress={() => setEditing(true)} /> : null}
        {admin && !isNew && !editing && e0 ? (e0.status === 'inactive' ? <Button small variant="success" title="Reactivate" onPress={() => setStatus('active')} /> : <Button small variant="danger" title="Deactivate" onPress={() => setConfirm(true)} />) : null}
      </Row>}>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Async state={isNew ? { data: {} as never, error: null, loading: dir.loading || data.loading, reload: () => {} } : { ...data, loading: data.loading || dir.loading }}>
        {() => selfEdit ? (
          <Card style={{ gap: 14 }}>
            <T muted>You can update your own contact details. Everything else is managed by HR.</T>
            <Field label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
            <Field label="Home address" value={form.homeAddress} onChangeText={(v) => set('homeAddress', v)} multiline />
            <Row><Button title="Save" onPress={saveSelf} loading={busy} /><Button variant="secondary" title="Cancel" onPress={() => requestExit(() => { setEditing(false); data.reload(); })} /></Row>
          </Card>
        ) : editing ? (
          <Card style={{ gap: 14 }}>
            <Grid min={260}>
              <Field label="Full name *" value={form.fullName} onChangeText={(v) => set('fullName', v)} />
              <Field label="Work email *" value={form.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" hint="Also the login email" />
              <Field label="Role / job title" value={form.jobTitle} onChangeText={(v) => set('jobTitle', v)} />
              <SelectField label="Department" value={form.departmentId} onChange={(v) => set('departmentId', v)} allowClear options={dir.departments.map((d) => ({ value: d.id, label: d.name }))} />
              <SelectField label="Manager" value={form.managerId} onChange={(v) => set('managerId', v)} allowClear options={managerChoices} />
              <SelectField label="Work schedule" value={form.scheduleId} onChange={(v) => set('scheduleId', v)} allowClear placeholder="Company default" options={(viewData?.sch ?? []).map((s) => ({ value: s.id, label: `${s.name} (${shortTime(s.startTime)}–${shortTime(s.endTime)})` }))} />
              <DateField label="Start date" value={form.startDate} onChange={(v) => set('startDate', v)} />
              <Field label="Country (ISO code)" value={form.country} onChangeText={(v) => set('country', v)} maxLength={2} autoCapitalize="characters" />
              <Field label="Phone (confidential)" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
              <Field label="Annual salary (confidential)" value={form.salary} onChangeText={(v) => set('salary', v)} keyboardType="decimal-pad" />
            </Grid>
            <Field label="Home address (confidential)" value={form.homeAddress} onChangeText={(v) => set('homeAddress', v)} multiline />
            <Chips label="Employment type" value={form.employmentType} onChange={(v) => set('employmentType', v)} options={TYPES} />
            <Chips label="Status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }]} />
            {isNew ? <Field label="Initial login password (optional)" value={form.loginPassword} onChangeText={(v) => set('loginPassword', v)} secureTextEntry hint="Leave empty to create the record without a login. The employee must change it at first sign-in." autoCapitalize="none" /> : null}
            {(isNew && form.loginPassword) || (!isNew && e0?.hasLogin) ? <Chips label="System role" value={form.loginRole} onChange={(v) => set('loginRole', v)} options={[{ value: 'STAFF', label: 'Staff' }, { value: 'MANAGER', label: 'Manager' }, { value: 'ADMIN', label: 'Admin / HR' }]} /> : null}
            <Row><Button title={isNew ? 'Create employee' : 'Save changes'} onPress={save} loading={busy} />{!isNew ? <Button variant="secondary" title="Cancel" onPress={() => requestExit(() => { setEditing(false); data.reload(); })} /> : null}</Row>
          </Card>
        ) : e0 ? (
          <>
            <Card style={{ gap: 14 }}>
              <Row gap={16} wrap><Avatar name={e0.fullName} size={72} />
                <View style={{ gap: 4, flexGrow: 1, flexShrink: 1, flexBasis: 220 }}><T v="h2">{e0.fullName}</T><T muted>{e0.jobTitle || 'No title'} · {e0.department?.name ?? 'No department'}</T>
                  <Row wrap><Badge label={label(e0.status)} tone={toneFor(e0.status)} /><Badge label={label(e0.employmentType)} /><Badge label={e0.employeeCode} tone="neutral" /></Row></View></Row>
            </Card>
            <ProfileTabs e={e0} managerName={dir.empMap.get(e0.managerId ?? '')?.fullName ?? '—'} schedule={viewData!.sch.find((s) => s.id === e0.scheduleId) ?? viewData!.sch[0]} timezone={settings.timezone} onEdit={() => setEditing(true)} canEdit={admin || isSelf} />
          </>
        ) : null}
      </Async>
      <ConfirmDialog visible={leaveAsk} title="Discard unsaved changes?" description="You have edits that haven't been saved. If you leave now they will be lost." confirmText="Discard changes" destructive onClose={() => setLeaveAsk(false)} onConfirm={() => { setLeaveAsk(false); pendingExit.current(); }} />
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Deactivate employee?">
        <T>{form.fullName} will be marked inactive, their login disabled and sessions ended. Their records are kept for payroll and audit.</T>
        <Row><Button variant="danger" title="Deactivate" onPress={() => setStatus('inactive')} loading={busy} /><Button variant="secondary" title="Cancel" onPress={() => setConfirm(false)} /></Row>
      </Sheet>
    </Screen>
  );
}
