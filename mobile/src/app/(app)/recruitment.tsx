import * as DocumentPicker from 'expo-document-picker';
import { Paperclip, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BarChart, HBarChart } from '@/components/charts';
import { Async, Avatar, Badge, Banner, Button, Card, Chips, Divider, Field, Grid, Row, Screen, Section, SelectField, Sheet, StatCard, T, label, toneFor } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { pct } from '@/lib/calc';
import { get, openFile, patch as httpPatch, post, uploadFile } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { formatDate, formatDateTime } from '@/lib/time';
import type { Application, CandidateStatus, EmploymentType, Interview, JobPosting } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { errMsg, useDirectory, validDate } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';

const STAGES: CandidateStatus[] = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'];

export default function Recruitment() {
  const { role, settings } = useAuth();
  const { c } = useTheme();
  const dir = useDirectory();
  const [jobOpen, setJobOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<CandidateStatus | 'all'>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [interviewFor, setInterviewFor] = useState<string | null>(null);

  const data = useAsync(async () => {
    const r = await get<{ jobs: JobPosting[]; applications: Application[] }>('/recruitment');
    return { jobs: r.jobs, cands: r.applications.map((a) => a.candidate), apps: r.applications, ivs: r.applications.flatMap((a) => a.interviews) as Interview[] };
  }, []);



  if (role !== 'admin') return <Screen title="Recruitment"><Banner tone="warning">Recruitment is available to HR administrators only.</Banner></Screen>;

  const update = async (id: string, patch: Partial<Application>) => {
    setMsg(null);
    try { await httpPatch(`/recruitment/applications/${id}`, patch); data.reload(); } catch (e) { setMsg(errMsg(e)); }
  };
  const hire = async (id: string) => {
    setMsg(null);
    try { await post(`/recruitment/applications/${id}/hire`, { startDate: new Date().toISOString().slice(0, 10) }); data.reload(); dir.reload(); setMsg('Candidate converted into an employee record. Open it in Employees to set a login.'); }
    catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <Screen title="Recruitment" subtitle="Vacancies, candidates and the hiring pipeline"
      actions={<Row><Button small variant="secondary" title="New vacancy" onPress={() => setJobOpen(true)} /><Button title="Add application" onPress={() => setAppOpen(true)} /></Row>}>
      {msg ? <Banner tone={msg.startsWith('Candidate converted') ? 'success' : 'danger'}>{msg}</Banner> : null}
      <Async state={{ ...data, loading: data.loading || dir.loading }}>
        {(d) => {
          const job = (id: string) => d.jobs.find((j) => j.id === id);
          const cand = (id: string) => d.cands.find((x) => x.id === id);
          const stats = { byStage: STAGES.map((st) => ({ label: label(st), value: d.apps.filter((a) => a.status === st).length })), open: d.jobs.filter((j) => j.status === 'open').length, hired: d.apps.filter((a) => a.status === 'hired').length };
          const apps = d.apps.filter((a) => filter === 'all' || a.status === filter);
          return (
            <>
              <Grid min={180}>
                <StatCard label="Open vacancies" value={stats.open} icon={<HRIcon name="recruitment" size="md" color={c.info} />} />
                <StatCard label="Total candidates" value={d.apps.length} icon={<HRIcon name="recruitment" size="md" color={c.info} />} tone="info" />
                <StatCard label="Interviews scheduled" value={d.ivs.filter((iv) => iv.scheduledAt >= new Date().toISOString()).length} sub={`${d.apps.filter((a) => a.status === 'interview').length} candidates in interview`} icon={<HRIcon name="calendar" size="md" color={c.warning} />} tone="warning" />
                <StatCard label="Offers sent" value={d.apps.filter((a) => a.status === 'offered').length} icon={<Send size={18} color={c.accent} />} tone="accent" />
                <StatCard label="Candidates hired" value={stats.hired} sub={`${pct(stats.hired, d.apps.length)}% conversion`} icon={<HRIcon name="completed" size="md" color={c.success} />} tone="success" />
              </Grid>
              <Section title="Pipeline">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                  {STAGES.filter((st) => st !== 'rejected').map((st) => {
                    const col = d.apps.filter((a) => a.status === st);
                    return (
                      <View key={st} style={{ width: 230, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 10, gap: 8 }} accessibilityLabel={`${label(st)} column, ${col.length} candidates`}>
                        <Row style={{ justifyContent: 'space-between' }}><T v="h3">{label(st)}</T><Badge label={String(col.length)} tone={toneFor(st)} /></Row>
                        {col.length === 0 ? <T v="small" muted>No candidates</T> : col.slice(0, 6).map((a) => (
                          <Pressable key={a.id} onPress={() => { setFilter(st); setSel(a.id); }} accessibilityRole="button" accessibilityLabel={`${a.candidate.fullName}, ${a.job.title}`}
                            style={{ backgroundColor: c.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.border }}>
                            <Row><Avatar name={a.candidate.fullName} size={30} /><View style={{ flex: 1, minWidth: 0 }}><T v="h3" numberOfLines={2}>{a.candidate.fullName}</T><T v="small" muted numberOfLines={2}>{a.job.title}</T></View></Row>
                          </Pressable>))}
                      </View>
                    );
                  })}
                </ScrollView>
              </Section>
              <Grid min={340}>
                <Card style={{ gap: 8 }}><T v="h3">Recruitment pipeline</T><HBarChart data={stats.byStage} /></Card>
                <Card style={{ gap: 8 }}><T v="h3">Applications per vacancy</T><BarChart labels={d.jobs.map((j) => j.title)} series={[{ name: 'Applications', values: d.jobs.map((j) => d.apps.filter((a) => a.jobId === j.id).length) }]} /></Card>
              </Grid>

              <Section title="Vacancies">
                <Card pad={false}>
                  {d.jobs.length === 0 ? <T muted style={{ padding: 16 }}>No vacancies yet.</T> : d.jobs.map((j, i) => (
                    <View key={j.id}>{i > 0 ? <Divider /> : null}
                      <Row style={{ padding: 14, justifyContent: 'space-between' }} wrap>
                        <View style={{ flexShrink: 1 }}><T v="h3">{j.title}</T><T v="small" muted>{dir.depMap.get(j.departmentId ?? '')?.name ?? '—'} · {label(j.employmentType)} · {j.location ?? 'Location TBC'} · {d.apps.filter((a) => a.jobId === j.id).length} applicants</T></View>
                        <Row><Badge label={label(j.status)} tone={toneFor(j.status)} />
                          <Button small variant="ghost" title={j.status === 'open' ? 'Close' : 'Re-open'} onPress={async () => { await httpPatch(`/recruitment/jobs/${j.id}`, { status: j.status === 'open' ? 'closed' : 'open' }); data.reload(); }} /></Row>
                      </Row>
                    </View>))}
                </Card>
              </Section>

              <Section title="Candidates">
                <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${d.apps.length})` }, ...STAGES.map((s) => ({ value: s, label: `${label(s)} (${d.apps.filter((a) => a.status === s).length})` }))]} />
                {apps.length === 0 ? <Card><T muted>No candidates in this stage.</T></Card> : apps.map((a) => {
                  const cd = cand(a.candidateId); const open = sel === a.id; const ivs = d.ivs.filter((x) => x.applicationId === a.id);
                  return (
                    <Card key={a.id} style={{ gap: 10 }}>
                      <Pressable onPress={() => setSel(open ? null : a.id)}>
                        <Row style={{ justifyContent: 'space-between' }} wrap>
                          <View style={{ flexShrink: 1 }}><T v="h3">{cd?.fullName}</T><T v="small" muted>{job(a.jobId)?.title} · applied {formatDate(a.createdAt.slice(0, 10))}{a.rating ? ` · ${'★'.repeat(a.rating)}` : ''}</T></View>
                          <Row>{a.hiringApproved && a.status !== 'hired' ? <Badge label="Hiring approved" tone="success" /> : null}<Badge label={label(a.status)} tone={toneFor(a.status)} /></Row>
                        </Row>
                      </Pressable>
                      {open ? (
                        <>
                          <T v="small" muted>{cd?.email}{cd?.phone ? ` · ${cd.phone}` : ''}</T>
                          {cd?.resumeId ? <Resume id={cd.resumeId} /> : null}
                          {ivs.map((iv) => <T key={iv.id} v="small">{formatDateTime(iv.scheduledAt, settings.timezone)} · {iv.mode} · {dir.empMap.get(iv.interviewerId ?? '')?.fullName ?? 'TBC'}</T>)}
                          {a.status !== 'hired' ? (
                            <>
                              <Chips label="Move to stage" value={a.status} onChange={(s) => update(a.id, { status: s })} options={STAGES.filter((s) => s !== 'hired').map((s) => ({ value: s, label: label(s) }))} />
                              <Chips label="Evaluation rating" value={String(a.rating ?? 0)} onChange={(v) => update(a.id, { rating: Number(v) || null })} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: `${v}★` }))} />
                              <Evaluation a={a} onSave={(t) => update(a.id, { evaluation: t })} />
                              <Row wrap>
                                <Button small variant="secondary" title="Schedule interview" onPress={() => setInterviewFor(a.id)} />
                                {a.status === 'offered' && !a.hiringApproved ? <Button small variant="success" title="Approve hiring" onPress={() => update(a.id, { hiringApproved: true })} /> : null}
                                {a.status === 'offered' && a.hiringApproved ? <Button small title="Convert to employee" onPress={() => hire(a.id)} /> : null}
                              </Row>
                            </>
                          ) : <T v="small" muted>Hired — employee record created.</T>}
                        </>
                      ) : null}
                    </Card>
                  );
                })}
              </Section>
              <JobSheet open={jobOpen} onClose={() => setJobOpen(false)} depts={dir.departments} onDone={() => { setJobOpen(false); data.reload(); }} />
              <AppSheet open={appOpen} onClose={() => setAppOpen(false)} jobs={d.jobs.filter((j) => j.status === 'open')} onDone={() => { setAppOpen(false); data.reload(); }} />
              <InterviewSheet appId={interviewFor} onClose={() => setInterviewFor(null)} people={dir.employees.filter((e) => e.status === 'active')} tz={settings.timezone} onDone={() => { setInterviewFor(null); data.reload(); }} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function Resume({ id }: { id: string }) {
  const { c } = useTheme();
  const open = async () => { try { await openFile(id); } catch { /* ignore */ } };
  return <Pressable onPress={open} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Paperclip size={16} color={c.primary} /><T v="small" color={c.primary}>View CV / resume</T></Pressable>;
}

function Evaluation({ a, onSave }: { a: Application; onSave: (t: string) => void }) {
  const [t, setT] = useState(a.evaluation ?? '');
  return <View style={{ gap: 6 }}><Field label="Evaluation notes" value={t} onChangeText={setT} multiline /><Row><Button small variant="secondary" title="Save notes" onPress={() => onSave(t)} /></Row></View>;
}

function JobSheet({ open, onClose, depts, onDone }: { open: boolean; onClose: () => void; depts: { id: string; name: string }[]; onDone: () => void }) {
  const [title, setTitle] = useState(''); const [dept, setDept] = useState(''); const [loc, setLoc] = useState(''); const [type, setType] = useState<EmploymentType>('full_time'); const [desc, setDesc] = useState(''); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!title.trim()) return setErr('Job title is required.');
    try { await post('/recruitment/jobs', { title: title.trim(), departmentId: dept || null, location: loc || null, employmentType: type, description: desc || null }); setTitle(''); setDesc(''); setErr(null); onDone(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={open} onClose={onClose} title="New vacancy">
      <Field label="Job title" value={title} onChangeText={setTitle} />
      <SelectField label="Department" value={dept} onChange={setDept} allowClear options={depts.map((d) => ({ value: d.id, label: d.name }))} />
      <Field label="Location" value={loc} onChangeText={setLoc} />
      <Chips label="Employment type" value={type} onChange={setType} options={[{ value: 'full_time', label: 'Full time' }, { value: 'part_time', label: 'Part time' }, { value: 'contract', label: 'Contract' }, { value: 'intern', label: 'Intern' }]} />
      <Field label="Description" value={desc} onChangeText={setDesc} multiline />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Publish vacancy" onPress={save} />
    </Sheet>
  );
}

function AppSheet({ open, onClose, jobs, onDone }: { open: boolean; onClose: () => void; jobs: JobPosting[]; onDone: () => void }) {
  const [job, setJob] = useState(''); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const pick = async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true }); if (!r.canceled) setFile(r.assets[0]); };
  const save = async () => {
    if (!job) return setErr('Choose a vacancy.');
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return setErr('Name and a valid email are required.');
    setBusy(true); setErr(null);
    try {
      const resumeId = file ? await uploadFile({ uri: file.uri, name: file.name, mimeType: file.mimeType }, 'resume') : null;
      await post('/recruitment/applications', { jobId: job, fullName: name.trim(), email: email.trim().toLowerCase(), phone: phone || null, resumeId });
      setName(''); setEmail(''); setPhone(''); setFile(null); onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={open} onClose={onClose} title="Add application">
      <SelectField label="Vacancy" value={job} onChange={setJob} options={jobs.map((j) => ({ value: j.id, label: j.title }))} />
      <Field label="Candidate name" value={name} onChangeText={setName} /><Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Row><Button small variant="secondary" icon={<Paperclip size={16} color="#888" />} title={file?.name ?? 'Upload CV / resume'} onPress={pick} /></Row>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Save application" onPress={save} loading={busy} />
    </Sheet>
  );
}

function InterviewSheet({ appId, onClose, people, tz, onDone }: { appId: string | null; onClose: () => void; people: { id: string; fullName: string; jobTitle: string }[]; tz: string; onDone: () => void }) {
  const [date, setDate] = useState(''); const [time, setTime] = useState('10:00'); const [who, setWho] = useState(''); const [mode, setMode] = useState('video'); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setErr('Enter a valid date and a 24h time (HH:MM).');
    // Interpret the entered wall-clock time in the company time zone.
    const guess = new Date(`${date}T${time}:00Z`);
    const local = new Date(guess.toLocaleString('en-US', { timeZone: tz }));
    const when = new Date(guess.getTime() - (local.getTime() - guess.getTime()));
    try { await post(`/recruitment/applications/${appId}/interviews`, { scheduledAt: when.toISOString(), interviewerId: who || null, mode }); setDate(''); setErr(null); onDone(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={!!appId} onClose={onClose} title="Schedule interview">
      <Row><DateField2 value={date} onChange={setDate} /><Field label={`Time (${tz})`} value={time} onChangeText={setTime} maxLength={5} /></Row>
      <SelectField label="Interviewer" value={who} onChange={setWho} allowClear options={people.map((p) => ({ value: p.id, label: p.fullName, sub: p.jobTitle }))} />
      <Chips label="Format" value={mode} onChange={setMode} options={[{ value: 'video', label: 'Video' }, { value: 'phone', label: 'Phone' }, { value: 'onsite', label: 'On-site' }]} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Schedule" onPress={save} />
    </Sheet>
  );
}
function DateField2({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Field label="Date (YYYY-MM-DD)" value={value} onChangeText={onChange} maxLength={10} autoCapitalize="none" error={value && !validDate(value) ? 'Use YYYY-MM-DD' : null} />;
}
