import { Paperclip, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FilePicker, type SelectedFile } from '@/components/ui/file-picker';
import { Async, Avatar, Badge, Banner, Button, Card, ConfirmDialog, Divider, Field, Grid, ProgressBar, Row, Screen, SelectField, Section, Sheet, StatCard, T, label, toneFor, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, fromISO, isoWeekday, leaveRemaining, monthRange, toISO, workingDaysBetween } from '@/lib/calc';
import { del, get, openFile, patch, post, uploadFile } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { formatDate, todayIn } from '@/lib/time';
import type { Holiday, LeaveBalance, LeaveRequest, LeaveType, WorkSchedule } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { DateField, errMsg, useDirectory, validDate } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';

export default function Leave() {
  const { role, employee, settings } = useAuth();
  const today = todayIn(settings.timezone);
  const dir = useDirectory();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { c } = useTheme();
  const toast = useToast();

  const data = useAsync(async () => {
    const [types, bal, reqs, hol, sch] = await Promise.all([
      get<LeaveType[]>('/leave-types'), get<LeaveBalance[]>('/leaves/balances'), get<LeaveRequest[]>('/leaves'),
      get<Holiday[]>('/holidays'), get<WorkSchedule[]>('/schedules'),
    ]);
    return { types, bal, reqs, hol, sched: sch[0] };
  }, []);

  const act = async (fn: string, args: Record<string, unknown>) => {
    setMsg(null);
    try {
      const id = String(args.id);
      if (fn === 'review_leave') await patch(`/leaves/${id}/${args.approve ? 'approve' : 'reject'}`, { note: args.note ?? undefined });
      else await patch(`/leaves/${id}/cancel`);
      toast.success(fn === 'review_leave' ? (args.approve ? 'Leave approved' : 'Leave rejected') : 'Request cancelled');
      data.reload();
    } catch (e) { setMsg(errMsg(e)); toast.error('Could not complete that', errMsg(e)); }
  };

  return (
    <Screen title="Leave Management" subtitle="Requests, balances and the holiday calendar"
      actions={employee ? <Button title="Request leave" icon={<Plus size={16} color="#fff" />} onPress={() => setOpen(true)} /> : null}>
      {msg ? <Banner tone="danger">{msg}</Banner> : null}
      <Async state={{ ...data, loading: data.loading || dir.loading, error: data.error ?? dir.error }}>
        {(d) => {
          const mine = d.reqs.filter((r) => r.employeeId === employee?.id);
          const typeOf = (id: string) => d.types.find((t) => t.id === id);
          const pendingFor = (typeId: string) => mine.filter((r) => r.status === 'pending' && r.leaveTypeId === typeId).reduce((s, r) => s + Number(r.workingDays), 0);
          const reviewable = d.reqs.filter((r) => r.status === 'pending' && r.employeeId !== employee?.id);
          const others = d.reqs.filter((r) => r.employeeId !== employee?.id && r.status !== 'pending');
          return (
            <>
              <Section title="My leave">
                {(() => {
                  const annual = d.types.find((t) => t.name === 'Annual Leave') ?? d.types.find((t) => t.tracksBalance);
                  const ab = annual ? d.bal.find((x) => x.leaveTypeId === annual.id && x.employeeId === employee?.id) : undefined;
                  const pend = mine.filter((r) => r.status === 'pending');
                  const next = d.hol.filter((h) => h.holidayDate >= today);
                  return (
                    <Grid min={200}>
                      <StatCard label={`${annual?.name ?? 'Annual leave'} allowance`} value={ab ? ab.entitled : '—'} sub="days this year" icon={<HRIcon name="calendar" size="md" color={c.info} />} />
                      <StatCard label="Leave taken" value={ab ? ab.used : '—'} sub="approved days used" icon={<HRIcon name="completed" size="md" color={c.success} />} tone="success" />
                      <StatCard label="Remaining leave" value={ab ? leaveRemaining(ab, pendingFor(annual!.id)) : '—'} sub={ab && pendingFor(annual!.id) ? `after ${pendingFor(annual!.id)} pending` : 'days available'} icon={<HRIcon name="calendar" size="md" color={c.accent} />} tone="accent" />
                      <StatCard label="Pending requests" value={pend.length} sub={pend.length ? 'Awaiting approval' : 'Nothing pending'} icon={<HRIcon name="pending" size="md" color={c.warning} />} tone="warning" />
                      <StatCard label="Upcoming holidays" value={next.length} sub={next[0] ? `${next[0].name}, ${formatDate(next[0].holidayDate, { day: 'numeric', month: 'short' })}` : 'None scheduled'} icon={<HRIcon name="calendar" size="md" color={c.info} />} tone="info" />
                    </Grid>
                  );
                })()}
                <Grid min={220}>
                  {d.types.filter((t) => t.tracksBalance).map((t) => {
                    const b = d.bal.find((x) => x.leaveTypeId === t.id && x.employeeId === employee?.id);
                    if (!b) return null;
                    return (
                      <Card key={t.id} style={{ gap: 8 }}>
                        <Row style={{ justifyContent: 'space-between' }}><T v="h3">{t.name}</T><T v="small" muted>{b.used} used / {b.entitled}</T></Row>
                        <ProgressBar value={b.entitled ? (b.used / b.entitled) * 100 : 0} color={t.color} />
                        <T v="small" muted>{leaveRemaining(b, pendingFor(t.id))} days left{pendingFor(t.id) ? ` · ${pendingFor(t.id)} pending` : ''}</T>
                      </Card>
                    );
                  })}
                </Grid>
              </Section>

              {role !== 'staff' && reviewable.length > 0 ? (
                <Section title={`Awaiting your approval (${reviewable.length})`}>
                  <Card style={{ gap: 14 }}>
                    {reviewable.map((r, i) => <Review key={r.id} r={r} i={i} name={dir.empMap.get(r.employeeId)?.fullName ?? 'Employee'} type={typeOf(r.leaveTypeId)} onAct={act} />)}
                  </Card>
                </Section>
              ) : null}

              <Grid min={380}>
                <Section title="My leave history">
                  <Card pad={false}>
                    {mine.length === 0 ? <T muted style={{ padding: 16 }}>No leave requests yet.</T> : mine.map((r, i) => (
                      <View key={r.id}>{i > 0 ? <Divider /> : null}
                        <View style={{ padding: 14, gap: 6 }}>
                          <Row style={{ justifyContent: 'space-between' }}><T v="h3">{typeOf(r.leaveTypeId)?.name}</T><Badge label={label(r.status)} tone={toneFor(r.status)} /></Row>
                          <T muted>{formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.workingDays} working day(s)</T>
                          {r.reason ? <T v="small" muted>“{r.reason}”</T> : null}
                          {r.reviewNote ? <T v="small" muted>Manager note: {r.reviewNote}</T> : null}
                          <Row>
                            {r.documentId ? <DocLink id={r.documentId} /> : null}
                            {(r.status === 'pending' || (r.status === 'approved' && r.startDate >= today)) ? <Button small variant="secondary" title="Cancel request" onPress={() => act('cancel_leave', { id: r.id })} /> : null}
                          </Row>
                        </View>
                      </View>))}
                  </Card>
                </Section>
                <HolidayCalendar holidays={d.hol} reqs={mine.filter((r) => r.status === 'approved' || r.status === 'pending')} sched={d.sched} today={today} canEdit={role === 'admin'} onChange={data.reload} />
              </Grid>

              {role !== 'staff' && others.length > 0 ? (
                <Section title={role === 'admin' ? 'Company leave history' : 'Team leave history'}>
                  <Card pad={false}>
                    {others.slice(0, 30).map((r, i) => (
                      <View key={r.id}>{i > 0 ? <Divider /> : null}
                        <Row style={{ padding: 12, justifyContent: 'space-between' }} wrap>
                          <View><T v="h3">{dir.empMap.get(r.employeeId)?.fullName}</T><T v="small" muted>{typeOf(r.leaveTypeId)?.name} · {formatDate(r.startDate)} → {formatDate(r.endDate)}</T></View>
                          <Badge label={label(r.status)} tone={toneFor(r.status)} />
                        </Row>
                      </View>))}
                  </Card>
                </Section>
              ) : null}

              <RequestSheet open={open} onClose={() => setOpen(false)} types={d.types} balances={d.bal.filter((b) => b.employeeId === employee?.id)} holidays={d.hol} sched={d.sched} onDone={() => { setOpen(false); data.reload(); }} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function Review({ r, i, name, type, onAct }: { r: LeaveRequest; i: number; name: string; type?: LeaveType; onAct: (fn: string, a: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<'approve' | 'reject' | null>(null);
  return (
    <View style={{ gap: 10 }}>
      {i > 0 ? <Divider /> : null}
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <Row style={{ flexShrink: 1 }}><Avatar name={name} size={40} />
          <View style={{ flexShrink: 1 }}><T v="h3">{name}</T><T muted>{type?.name} · {formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.workingDays} day(s)</T>{r.reason ? <T v="small" muted>“{r.reason}”</T> : null}</View></Row>
        <Row><Badge label="Pending" tone="warning" />{r.documentId ? <DocLink id={r.documentId} /> : null}</Row>
      </Row>
      <Field label="Decision note (optional)" value={note} onChangeText={setNote} />
      <Row><Button small variant="success" title="Approve" onPress={() => setAsk('approve')} /><Button small variant="danger" title="Reject" onPress={() => setAsk('reject')} /></Row>
      <ConfirmDialog visible={ask !== null} destructive={ask === 'reject'} title={ask === 'approve' ? `Approve ${name}'s leave?` : `Reject ${name}'s leave?`}
        description={ask === 'approve' ? `${r.workingDays} working day(s) will be deducted from their balance and added to the attendance calendar.` : 'The employee will be notified of the rejection.'}
        confirmText={ask === 'approve' ? 'Approve' : 'Reject'} onClose={() => setAsk(null)}
        onConfirm={() => { const approve = ask === 'approve'; setAsk(null); onAct('review_leave', { id: r.id, approve, note: note || null }); }} />
    </View>
  );
}

function DocLink({ id }: { id: string }) {
  const { c } = useTheme();
  const open = async () => {
    try { await openFile(id); } catch { /* surfaced by the OS/browser */ }
  };
  return <Pressable onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Paperclip size={16} color={c.primary} /><T v="small" color={c.primary}>Document</T></Pressable>;
}

function RequestSheet({ open, onClose, types, balances, holidays, sched, onDone }: {
  open: boolean; onClose: () => void; types: LeaveType[]; balances: LeaveBalance[]; holidays: Holiday[]; sched?: WorkSchedule; onDone: () => void;
}) {
  const [typeId, setTypeId] = useState<string>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === (typeId || types[0]?.id));
  const ok = validDate(start) && validDate(end);
  const days = ok ? workingDaysBetween(start, end, sched?.workDays, holidays.map((h) => h.holidayDate)) : 0;
  const bal = balances.find((b) => b.leaveTypeId === type?.id);

  const submit = async () => {
    if (!type) return;
    if (!ok) return setErr('Enter valid start and end dates.');
    if (end < start) return setErr('End date is before start date.');
    if (days === 0) return setErr('The selected dates contain no working days.');
    if (type.requiresDocument && !file) return setErr(`${type.name} requires a supporting document.`);
    setBusy(true); setErr(null);
    try {
      const documentId = file ? await uploadFile({ uri: file.uri, name: file.name, mimeType: file.mimeType }, 'leave_document') : undefined;
      await post('/leaves', { leaveTypeId: type.id, startDate: start, endDate: end, reason: reason.trim() || undefined, documentId });
      toast.success('Leave request submitted', `${days} working day(s) sent for approval`);
      setStart(''); setEnd(''); setReason(''); setFile(null);
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={open} onClose={onClose} title="Request leave">
      <SelectField label="Leave type" value={type?.id ?? ''} onChange={(v) => setTypeId(v)} options={types.map((t) => ({ value: t.id, label: t.name }))} />
      <Row><DateField label="Start date" value={start} onChange={setStart} /><DateField label="End date" value={end} onChange={setEnd} /></Row>
      {ok && end >= start ? <Banner tone={bal && type?.tracksBalance && days > leaveRemaining(bal) ? 'danger' : 'info'}>{days} working day(s) (weekends and public holidays excluded){bal && type?.tracksBalance ? ` · ${leaveRemaining(bal)} available` : ''}</Banner> : null}
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
      <FilePicker fileType="all" maxSizeBytes={5 * 1024 * 1024} placeholder={file ? file.name : type?.requiresDocument ? 'Attach supporting document (required)' : 'Attach supporting document (optional)'} variant="outline" showPreview={false}
        onFilesSelected={(f) => { setErr(null); setFile(f[0] ?? null); }} onError={(m) => setErr(m)} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Submit request" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function HolidayCalendar({ holidays, reqs, sched, today, canEdit, onChange }: {
  holidays: Holiday[]; reqs: LeaveRequest[]; sched?: WorkSchedule; today: string; canEdit: boolean; onChange: () => void;
}) {
  const { c } = useTheme();
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { start, end } = monthRange(month);
  const workDays = sched?.workDays ?? [1, 2, 3, 4, 5];
  const cells = useMemo(() => {
    const lead = isoWeekday(start) - 1;
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [start, end]);
  const holMap = new Map(holidays.map((h) => [h.holidayDate, h.name]));
  const shift = (n: number) => { const d = fromISO(month); setMonth(toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))); };

  const addHoliday = async () => {
    if (!validDate(hDate) || !hName.trim()) return setErr('Enter a date and name.');
    try { await post('/holidays', { holidayDate: hDate, name: hName.trim() }); setHDate(''); setHName(''); setErr(null); onChange(); } catch (e) { setErr(errMsg(e)); }
  };
  const remove = async (id: string) => { await del(`/holidays/${id}`); onChange(); };

  return (
    <Section title="Holiday calendar">
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button small variant="secondary" title="‹" onPress={() => shift(-1)} />
          <T v="h3">{formatDate(month, { month: 'long', year: 'numeric' })}</T>
          <Button small variant="secondary" title="›" onPress={() => shift(1)} />
        </Row>
        <View style={{ flexDirection: 'row' }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <T key={i} v="small" muted style={{ flex: 1, textAlign: 'center' }}>{d}</T>)}</View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              const hol = d ? holMap.has(d) : false;
              const leave = d ? reqs.some((r) => r.startDate <= d && r.endDate >= d && workDays.includes(isoWeekday(d)) && !holMap.has(d)) : false;
              const off = d ? !workDays.includes(isoWeekday(d)) : false;
              const bg = hol ? c.accentSoft : leave ? c.primarySoft : 'transparent';
              return (
                <View key={i} style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1.5, borderRadius: 8, backgroundColor: bg, borderWidth: d === today ? 1.5 : 0, borderColor: c.primary }}>
                  {d ? <T v="small" color={hol ? c.accent : leave ? c.primary : off ? c.muted : c.text} style={{ fontWeight: hol || leave ? '800' : '500' }}>{Number(d.slice(8))}</T> : null}
                </View>
              );
            })}
          </View>
        ))}
        <Row wrap gap={14}><Row gap={6}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.accent }} /><T v="small" muted>Public holiday</T></Row><Row gap={6}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.primary }} /><T v="small" muted>My leave</T></Row></Row>
        <Divider />
        <T v="h3">Upcoming public holidays</T>
        {holidays.filter((h) => h.holidayDate >= today).slice(0, 6).map((h) => (
          <Row key={h.id} style={{ justifyContent: 'space-between' }}><T>{h.name}</T><Row><T muted>{formatDate(h.holidayDate, { weekday: 'short', day: 'numeric', month: 'short' })}</T>{canEdit ? <Pressable onPress={() => remove(h.id)}><T v="small" color={c.danger}>Remove</T></Pressable> : null}</Row></Row>
        ))}
        {holidays.filter((h) => h.holidayDate >= today).length === 0 ? <T muted>No upcoming holidays configured.</T> : null}
        {canEdit ? (
          <View style={{ gap: 8 }}>
            <Row><DateField label="Add holiday date" value={hDate} onChange={setHDate} /><Field label="Name" value={hName} onChangeText={setHName} /></Row>
            {err ? <Banner tone="danger">{err}</Banner> : null}
            <Button small variant="secondary" title="Add holiday" onPress={addHoliday} />
          </View>
        ) : null}
      </Card>
    </Section>
  );
}
