import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Checkbox } from '@/components/ui/checkbox';
import { Async, Badge, Banner, Button, Card, Chips, Field, Grid, Row, Screen, Section, T, label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { HRIcon } from '@/components/ui/hr-icon';
import { useAnimatedLogout } from '@/hooks/useAnimatedLogout';
import { exportCSV } from '@/lib/export';
import { get, patch, post, errorMessage } from '@/services/api';
import { THEMES, useTheme } from '@/lib/theme';
import type { AuditLog, Employee, WorkSchedule } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { errMsg } from '@/features/shared';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']] as const;

export default function Settings() {
  const { role, profile, refresh, signOut } = useAuth();
  const { exiting, logout } = useAnimatedLogout(signOut);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const admin = role === 'admin';

  const exportMine = async () => {
    try {
      const data = await get<Record<string, unknown>>('/me/export');
      await exportCSV('my-data-export', Object.entries(data).map(([section, value]) => ({ section, data: JSON.stringify(value) })));
    } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); }
  };

  return (
    <Screen title="Settings" subtitle="Appearance, privacy and company configuration">
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      <Grid min={340}>
        <Card style={{ gap: 12 }}>
          <Row gap={10}><HRIcon name="person" size="lg" /><T v="h3">Account</T></Row>
          <T>{profile?.fullName}</T><T muted>{profile?.email}</T><Badge label={role === 'admin' ? 'Admin / HR' : label(role)} tone="primary" />
          <Button variant="secondary" title="Log out" icon={<HRIcon name="logout" size="sm" tone="default" animate={exiting} />} onPress={logout} />
        </Card>
        <Card style={{ gap: 12 }}>
          <Row gap={10}><HRIcon name="appearance" size="lg" /><T v="h3">Appearance</T></Row>
          <T v="small" muted>Navy Light is the default HR Connect look. Use Navy Dark in low light, or a Grey theme for a more neutral aesthetic.</T>
          <ThemePicker />
        </Card>
        <Card style={{ gap: 10 }}>
          <T v="h3">Privacy</T>
          <T muted>Download a copy of the personal data HR holds about you (profile, attendance, leave, payslips).</T>
          <Button variant="secondary" title="Export my data" onPress={exportMine} />
          <T v="small" muted>No device location or background tracking is used. Clock times come from the server.</T>
        </Card>
      </Grid>
      <ChangePassword setMsg={setMsg} />
      {admin ? <AdminSettings onSaved={refresh} setMsg={setMsg} /> : null}
    </Screen>
  );
}

function AdminSettings({ onSaved, setMsg }: { onSaved: () => void; setMsg: (m: { tone: 'success' | 'danger'; text: string }) => void }) {
  const { settings } = useAuth();
  const [f, setF] = useState({ companyName: '', timezone: '', country: '', lateGraceMinutes: '', overtimeMultiplier: '', retentionMonths: '' });
  const [seen, setSeen] = useState<unknown>(null);
  if (seen !== settings) {
    setSeen(settings);
    setF({ companyName: settings.companyName, timezone: settings.timezone, country: settings.country, lateGraceMinutes: String(settings.lateGraceMinutes), overtimeMultiplier: String(settings.overtimeMultiplier), retentionMonths: String(settings.retentionMonths) });
  }

  const data = useAsync(async () => {
    const [emps, schedules, audit] = await Promise.all([get<Employee[]>('/employees'), get<WorkSchedule[]>('/schedules'), get<AuditLog[]>('/audit-logs', { limit: 15 })]);
    return { logins: emps.filter((e) => e.hasLogin), schedules, audit };
  }, []);

  const save = async () => {
    try { new Intl.DateTimeFormat('en', { timeZone: f.timezone }); } catch { return setMsg({ tone: 'danger', text: `"${f.timezone}" is not a valid IANA time zone (e.g. Europe/London).` }); }
    const row = { companyName: f.companyName.trim(), timezone: f.timezone.trim(), country: f.country.trim().toUpperCase(), lateGraceMinutes: Number(f.lateGraceMinutes), overtimeMultiplier: Number(f.overtimeMultiplier), retentionMonths: Number(f.retentionMonths) };
    if (!row.companyName || row.lateGraceMinutes < 0 || row.overtimeMultiplier < 1 || row.retentionMonths < 6) return setMsg({ tone: 'danger', text: 'Check values: grace ≥ 0, overtime multiplier ≥ 1, retention ≥ 6 months.' });
    try { await patch('/settings', row); setMsg({ tone: 'success', text: 'Settings saved.' }); onSaved(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); }
  };
  const setRole = async (id: string, r: 'ADMIN' | 'MANAGER' | 'STAFF') => { try { await patch(`/employees/${id}`, { loginRole: r }); data.reload(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); } };
  const purge = async () => { try { const r = await post('/settings/purge'); setMsg({ tone: 'success', text: `Retention purge done: ${JSON.stringify(r)}` }); data.reload(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); } };

  return (
    <>
      <Section title="Company configuration">
        <Card style={{ gap: 12 }}>
          <Grid min={240}>
            <Field label="Company name" value={f.companyName} onChangeText={(v) => setF({ ...f, companyName: v })} />
            <Field label="Time zone (IANA)" value={f.timezone} onChangeText={(v) => setF({ ...f, timezone: v })} hint="Used for work dates, lateness and schedules" autoCapitalize="none" />
            <Field label="Default country" value={f.country} onChangeText={(v) => setF({ ...f, country: v })} maxLength={2} autoCapitalize="characters" />
            <Field label="Late grace (minutes)" value={f.lateGraceMinutes} onChangeText={(v) => setF({ ...f, lateGraceMinutes: v })} keyboardType="number-pad" />
            <Field label="Overtime pay multiplier" value={f.overtimeMultiplier} onChangeText={(v) => setF({ ...f, overtimeMultiplier: v })} keyboardType="decimal-pad" />
            <Field label="Data retention (months)" value={f.retentionMonths} onChangeText={(v) => setF({ ...f, retentionMonths: v })} keyboardType="number-pad" hint="Audit logs & old notifications are purged beyond this" />
          </Grid>
          <Row wrap><Button title="Save settings" onPress={save} /><Button variant="secondary" title="Run retention purge" onPress={purge} /></Row>
        </Card>
      </Section>
      <Async state={data}>
        {(d) => (
          <>
            <Section title="Working schedules">
              {d.schedules.map((s) => <ScheduleCard key={s.id} s={s} onSaved={data.reload} setMsg={setMsg} />)}
            </Section>
            <Section title="User roles">
              <Card style={{ gap: 12 }}>
                {d.logins.map((p) => (
                  <Row key={p.id} style={{ justifyContent: 'space-between' }} wrap><View><T v="h3">{p.fullName}</T><T v="small" muted>{p.email}</T></View>
                    <Chips value={p.loginRole ?? 'STAFF'} onChange={(r) => setRole(p.id, r)} options={[{ value: 'STAFF', label: 'Staff' }, { value: 'MANAGER', label: 'Manager' }, { value: 'ADMIN', label: 'Admin' }]} /></Row>))}
              </Card>
            </Section>
            <Section title="Audit log (latest)">
              <Card style={{ gap: 6 }}>{d.audit.map((a) => <Row key={a.id} style={{ justifyContent: 'space-between' }}><T v="small">{a.action} · {a.entity}</T><T v="small" muted>{new Date(a.createdAt).toLocaleString('en-GB')}</T></Row>)}</Card>
            </Section>
          </>
        )}
      </Async>
    </>
  );
}

function ScheduleCard({ s, onSaved, setMsg }: { s: WorkSchedule; onSaved: () => void; setMsg: (m: { tone: 'success' | 'danger'; text: string }) => void }) {
  const [days, setDays] = useState(s.workDays);
  const [start, setStart] = useState(s.startTime.slice(0, 5));
  const [end, setEnd] = useState(s.endTime.slice(0, 5));
  const [brk, setBrk] = useState(String(s.unpaidBreakMinutes));
  const { c } = useTheme();
  const save = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end <= start) return setMsg({ tone: 'danger', text: 'Times must be HH:MM and finish after start.' });
    if (days.length === 0) return setMsg({ tone: 'danger', text: 'Select at least one working day.' });
    try { await patch(`/schedules/${s.id}`, { workDays: [...days].sort(), startTime: start, endTime: end, unpaidBreakMinutes: Number(brk) || 0 }); setMsg({ tone: 'success', text: `${s.name} schedule saved.` }); onSaved(); }
    catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); }
  };
  return (
    <Card style={{ gap: 10 }}>
      <T v="h3">{s.name}</T>
      <Row wrap gap={6}>{DAYS.map(([n, l]) => { const on = days.includes(n); return <Pressable key={n} onPress={() => setDays(on ? days.filter((x) => x !== n) : [...days, n])} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.surface }}><T v="small" color={on ? c.onPrimary : c.text} style={{ fontWeight: '400' }}>{l}</T></Pressable>; })}</Row>
      <Row><Field label="Start" value={start} onChangeText={setStart} maxLength={5} /><Field label="Finish" value={end} onChangeText={setEnd} maxLength={5} /><Field label="Unpaid break (min)" value={brk} onChangeText={setBrk} keyboardType="number-pad" /></Row>
      <Row><Button small title="Save schedule" onPress={save} /></Row>
    </Card>
  );
}

function ChangePassword({ setMsg }: { setMsg: (m: { tone: 'success' | 'danger'; text: string }) => void }) {
  const { signOut } = useAuth();
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await post('/auth/change-password', { currentPassword: cur, newPassword: next }); setMsg({ tone: 'success', text: 'Password changed. Please sign in again.' }); await signOut(); }
    catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); }
    setBusy(false);
  };
  return (
    <Card style={{ gap: 10 }}>
      <T v="h3">Change password</T>
      <Grid min={240}><Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" /><Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" hint="10+ characters with upper, lower and a digit" /></Grid>
      <Row><Button small title="Change password" onPress={submit} loading={busy} disabled={!cur || next.length < 10} /></Row>
    </Card>
  );
}

/** Four named themes (Navy/Grey × Light/Dark) shown as small previews, plus an optional "follow device" switch. */
function ThemePicker() {
  const { c, setTheme, themeId, mode, setMode, scheme } = useTheme();
  const follow = mode === 'system';
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {THEMES.map((t) => {
          const on = themeId === t.id;
          const sw = swatches[t.id];
          return (
            <Pressable key={t.id} onPress={() => setTheme(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t.name}. ${t.note}`}
              style={{ flexGrow: 1, flexBasis: 150, borderRadius: 14, borderWidth: 2, borderColor: on ? c.primary : c.border, padding: 10, gap: 8, backgroundColor: c.surface }}>
              <View style={{ height: 54, borderRadius: 8, backgroundColor: sw.bg, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: sw.border }}>
                <View style={{ width: 18, backgroundColor: sw.side }} />
                <View style={{ flex: 1, padding: 6, gap: 4 }}><View style={{ height: 8, width: '60%', borderRadius: 4, backgroundColor: sw.text }} /><View style={{ height: 14, width: '40%', borderRadius: 5, backgroundColor: sw.primary }} /></View>
              </View>
              <View><T v="h3">{on ? '✓ ' : ''}{t.name}</T><T v="small" muted>{t.note}</T></View>
            </Pressable>
          );
        })}
      </View>
      <Checkbox checked={follow} onCheckedChange={(v) => setMode(v ? 'system' : scheme)} label="Match my device's light/dark setting" />
    </View>
  );
}

const swatches = {
  'navy-light': { bg: '#F6F8FB', side: '#0B1830', primary: '#142B49', text: '#CBD5E1', border: '#E2E8F0' },
  'navy-dark': { bg: '#0B1220', side: '#101C30', primary: '#7AAAF0', text: '#304157', border: '#304157' },
  'grey-light': { bg: '#F4F4F5', side: '#27272A', primary: '#3F3F46', text: '#D4D4D8', border: '#E4E4E7' },
  'grey-dark': { bg: '#101012', side: '#09090B', primary: '#E4E4E7', text: '#3A3A40', border: '#2E2E33' },
} as const;
