import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarChart, PieChart } from '@/components/charts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Async, Badge, Banner, Button, Card, Chips, Field, Grid, ProgressBar, Row, Screen, Section, SelectField, Sheet, StatCard, T, label, toneFor } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatMoney, pct, sum } from '@/lib/calc';
import { get, patch, post } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { formatDate } from '@/lib/time';
import type { Benefit, EmployeeBenefit } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { exportCSV } from '@/lib/export';
import { errMsg, useDirectory } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';

const CATS = ['health', 'pension', 'transport', 'meal', 'wellness', 'other'] as const;

export default function Benefits() {
  const { role, employee } = useAuth();
  const { c } = useTheme();
  const dir = useDirectory();
  const admin = role === 'admin';
  const [assign, setAssign] = useState<Benefit | null>(null);
  const [edit, setEdit] = useState<Partial<Benefit> | null>(null);
  const [cat, setCat] = useState('all');

  const data = useAsync(async () => {
    const r = await get<{ benefits: Benefit[]; enrolments: EmployeeBenefit[] }>('/benefits');
    return { benefits: r.benefits, enrol: r.enrolments };
  }, []);

  const summary = useMemo(() => {
    const d = data.data; if (!d) return null;
    const active = d.enrol.filter((e) => e.status === 'enrolled');
    const byCat = CATS.map((cat) => ({ label: label(cat), value: sum(active.filter((e) => d.benefits.find((b) => b.id === e.benefitId)?.category === cat).map((e) => Number(e.monthlyCost))) })).filter((x) => x.value > 0);
    return { total: sum(active.map((e) => Number(e.monthlyCost))), enrolled: active.length, byCat };
  }, [data.data]);

  const setStatus = async (id: string, status: EmployeeBenefit['status']) => { await patch(`/benefits/enrolments/${id}`, { status }); data.reload(); };

  return (
    <Screen title="Employee Benefits" subtitle={admin ? 'Plans, eligibility, enrolment and costs' : 'Your benefits'}
      actions={admin ? <Row><Button small variant="secondary" title="Export CSV" onPress={() => data.data && exportCSV('benefit-summary', data.data.enrol.map((e) => ({ employee: dir.empMap.get(e.employeeId)?.fullName, benefit: data.data!.benefits.find((b) => b.id === e.benefitId)?.name, status: e.status, startDate: e.startDate, monthlyCost: e.monthlyCost })))} /><Button title="New benefit" onPress={() => setEdit({ category: 'other', isAllowance: false })} /></Row> : null}>
      <Async state={{ ...data, loading: data.loading || dir.loading }}>
        {(d) => {
          const mine = d.enrol.filter((e) => e.employeeId === employee?.id);
          return (
            <>
              {admin && summary ? (
                <>
                  <Grid min={200}>
                    <StatCard label="Monthly benefit cost" value={formatMoney(summary.total)} icon={<HRIcon name="wallet" size="md" color={c.primary} />} />
                    <StatCard label="Active enrolments" value={summary.enrolled} icon={<HRIcon name="team" size="md" color={c.success} />} tone="success" />
                  </Grid>
                  <Grid min={320}>
                    <Card style={{ gap: 8 }}><T v="h3">Cost by category (monthly)</T><PieChart size={170} data={summary.byCat} format={(n) => formatMoney(n)} /></Card>
                    <Card style={{ gap: 8 }}><T v="h3">Enrolment by benefit</T>
                      <BarChart labels={d.benefits.map((b) => b.name)} series={[{ name: 'Enrolled', values: d.benefits.map((b) => d.enrol.filter((e) => e.benefitId === b.id && e.status === 'enrolled').length) }]} /></Card>
                  </Grid>
                </>
              ) : null}
              <Section title="My benefits">
                {mine.length === 0 ? <Card><T muted>You have no benefits assigned yet.</T></Card> : (
                  <Grid min={260}>{mine.map((e) => { const b = d.benefits.find((x) => x.id === e.benefitId); return (
                    <Card key={e.id} style={{ gap: 6 }}><Row style={{ justifyContent: 'space-between' }}><T v="h3">{b?.name}</T><Badge label={label(e.status)} tone={toneFor(e.status)} /></Row>
                      <T muted>{b?.description}</T><T v="small" muted>Since {formatDate(e.startDate)} · {formatMoney(Number(e.monthlyCost))}/month</T></Card>); })}</Grid>
                )}
              </Section>
              <Section title="Benefit catalogue">
                <Tabs value={cat} onValueChange={setCat} enableSwipe={false} haptic={false}>
                  <TabsList>{[['all', 'All'], ...CATS.map((x) => [x, label(x)])].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
                </Tabs>
                <Grid min={300}>
                  {d.benefits.filter((b) => cat === 'all' || b.category === cat).map((b) => {
                    const mineE = mine.find((e) => e.benefitId === b.id);
                    const count = d.enrol.filter((e) => e.benefitId === b.id && e.status === 'enrolled').length;
                    return (
                      <Card key={b.id} style={{ gap: 10 }}>
                        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} wrap>
                          <View style={{ flexShrink: 1 }}><T v="h3">{b.name}</T><T v="small" muted>{label(b.category)}</T></View>
                          <Row><Badge label={mineE ? label(mineE.status) : 'Not enrolled'} tone={mineE ? toneFor(mineE.status) : 'neutral'} />{b.isAllowance ? <Badge label="Allowance" tone="accent" /> : null}</Row>
                        </Row>
                        <T muted>{b.description}</T>
                        <Row style={{ justifyContent: 'space-between' }}><T v="small" muted>Eligibility: {b.eligibility}</T>{admin ? <T v="h3">{formatMoney(Number(b.monthlyCost))}/mo</T> : mineE ? <T v="h3">{formatMoney(Number(mineE.monthlyCost))}/mo</T> : null}</Row>
                        {admin ? <View style={{ gap: 4 }}><T v="small" muted>{count} enrolled</T><ProgressBar value={pct(count, dir.employees.filter((e) => e.status !== 'inactive').length)} /></View> : null}
                        <Accordion type="single" collapsible>
                          <AccordionItem value="details">
                            <AccordionTrigger>View details</AccordionTrigger>
                            <AccordionContent>
                              <View style={{ gap: 8, paddingBottom: 8 }}>
                                <T v="small" muted>Type: {label(b.category)} · {b.isAllowance ? 'Paid through payroll as an allowance.' : 'Provided by the company; not part of take-home pay.'}</T>
                                {mineE ? <T v="small" muted>You enrolled on {formatDate(mineE.startDate)}.</T> : <T v="small" muted>Ask HR to enrol you if you are eligible.</T>}
                                {admin ? (
                                  <>
                                    <Row wrap><Button small variant="secondary" title="Assign to employee" onPress={() => setAssign(b)} /><Button small variant="ghost" title="Edit" onPress={() => setEdit(b)} /></Row>
                                    {d.enrol.filter((e) => e.benefitId === b.id).slice(0, 12).map((e) => (
                                      <Row key={e.id} style={{ justifyContent: 'space-between' }}><T v="small">{dir.empMap.get(e.employeeId)?.fullName}</T><Row><Badge label={label(e.status)} tone={toneFor(e.status)} />{e.status !== 'ended' ? <Button small variant="ghost" title="End" onPress={() => setStatus(e.id, 'ended')} /> : <Button small variant="ghost" title="Re-enrol" onPress={() => setStatus(e.id, 'enrolled')} />}</Row></Row>))}
                                  </>
                                ) : null}
                              </View>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </Card>
                    );
                  })}
                </Grid>
              </Section>
              <AssignSheet benefit={assign} onClose={() => setAssign(null)} people={dir.employees.filter((e) => e.status !== 'inactive')} onDone={() => { setAssign(null); data.reload(); }} />
              <EditSheet benefit={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); data.reload(); }} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function AssignSheet({ benefit, onClose, people, onDone }: { benefit: Benefit | null; onClose: () => void; people: { id: string; fullName: string; jobTitle: string }[]; onDone: () => void }) {
  const [emp, setEmp] = useState(''); const [cost, setCost] = useState(''); const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!emp || !benefit) return setErr('Choose an employee.');
    try { await post('/benefits/enrolments', { employeeId: emp, benefitId: benefit.id, ...(cost === '' ? {} : { monthlyCost: Number(cost) }) }); setEmp(''); setCost(''); setErr(null); onDone(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={!!benefit} onClose={onClose} title={`Assign ${benefit?.name ?? ''}`}>
      <Banner tone="info">Eligibility: {benefit?.eligibility}</Banner>
      <SelectField label="Employee" value={emp} onChange={setEmp} options={people.map((p) => ({ value: p.id, label: p.fullName, sub: p.jobTitle }))} />
      <Field label="Monthly cost override (optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" hint={`Default ${benefit?.monthlyCost ?? 0}`} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Enrol" onPress={submit} />
    </Sheet>
  );
}

function EditSheet({ benefit, onClose, onDone }: { benefit: Partial<Benefit> | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Partial<Benefit>>({}); const [cost, setCost] = useState(''); const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<unknown>(null);
  if (benefit !== loaded) { setLoaded(benefit); setF(benefit ?? {}); setCost(benefit?.monthlyCost !== undefined ? String(benefit.monthlyCost) : ''); setErr(null); }
  const submit = async () => {
    if (!f.name?.trim()) return setErr('Name is required.');
    const row = { name: f.name.trim(), category: f.category ?? 'other', description: f.description ?? null, monthlyCost: Number(cost || 0), isAllowance: !!f.isAllowance, eligibility: f.eligibility || 'All active employees' };
    try { if (f.id) await patch(`/benefits/${f.id}`, row); else await post('/benefits', row); onDone(); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={!!benefit} onClose={onClose} title={f.id ? 'Edit benefit' : 'New benefit'}>
      <Field label="Name" value={f.name ?? ''} onChangeText={(v) => setF({ ...f, name: v })} />
      <Chips label="Category" value={(f.category ?? 'other') as string} onChange={(v) => setF({ ...f, category: v })} options={CATS.map((x) => ({ value: x, label: label(x) }))} />
      <Field label="Description" value={f.description ?? ''} onChangeText={(v) => setF({ ...f, description: v })} multiline />
      <Field label="Monthly cost" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
      <Field label="Eligibility" value={f.eligibility ?? ''} onChangeText={(v) => setF({ ...f, eligibility: v })} placeholder="All active employees" />
      <Chips label="Added to payroll as an allowance?" value={f.isAllowance ? 'yes' : 'no'} onChange={(v) => setF({ ...f, isAllowance: v === 'yes' })} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Save" onPress={submit} />
    </Sheet>
  );
}
