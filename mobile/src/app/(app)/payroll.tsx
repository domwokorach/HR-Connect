import { Download } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BarChart, LineChart } from '@/components/charts';
import { Table, type TableColumn } from '@/components/ui/table';
import { Async, Badge, Banner, Button, Card, Chips, ConfirmDialog, Divider, Field, Grid, Row, Screen, Section, SelectField, Sheet, StatCard, T, label, toneFor, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatMoney, sum } from '@/lib/calc';
import { esc, exportCSV, exportPDF } from '@/lib/export';
import { del as httpDelete, get, patch, post } from '@/services/api';
import { useTheme } from '@/lib/theme';
import { formatDate } from '@/lib/time';
import type { AuditLog, DeductionRule, EmploymentType, Payroll as PayrollRun, PayrollItem, Payslip } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { DateField, errMsg, useDirectory, validDate } from '@/features/shared';
import { HRIcon } from '@/components/ui/hr-icon';

const monthLabel = (d: string) => formatDate(d, { month: 'short', year: '2-digit' });

export default function Payroll() {
  const { role } = useAuth();
  return role === 'admin' ? <AdminPayroll /> : <MyPayslips />;
}

// ---------------------------------------------------------------- employee self-service
function MyPayslips() {
  const { employee } = useAuth();
  const dir = useDirectory();
  const data = useAsync(() => get<Payslip[]>('/payroll/payslips/me'), []);
  const [open, setOpen] = useState<Payslip | null>(null);
  return (
    <Screen title="My Payslips" subtitle="Only you and HR payroll administrators can see these">
      <Async state={data} empty={(d) => d.length === 0}>
        {(rows) => (
          <Card pad={false}>
            {rows.map((p, i) => (
              <View key={p.id}>{i > 0 ? <Divider /> : null}
                <Pressable onPress={() => setOpen(p)} style={{ padding: 14 }}>
                  <Row style={{ justifyContent: 'space-between' }}><View style={{ flexShrink: 1, minWidth: 0 }}><T v="h3">{formatDate(p.periodStart, { month: 'long', year: 'numeric' })}</T><T v="small" muted>Gross {formatMoney(p.grossPay)}</T></View>
                    <View style={{ alignItems: 'flex-end' }}><T v="h3">{formatMoney(p.netPay)}</T><Badge label={label(p.paymentStatus)} tone={toneFor(p.paymentStatus)} /></View></Row>
                </Pressable>
              </View>))}
          </Card>
        )}
      </Async>
      <PayslipSheet p={open} name={employee?.fullName ?? dir.empMap.get(open?.employeeId ?? '')?.fullName ?? ''} onClose={() => setOpen(null)} />
    </Screen>
  );
}

function payslipHtml(p: Payslip, name: string) {
  const rows: [string, number][] = [['Basic salary', p.basicSalary], ['Allowances', p.allowances], ['Bonuses', p.bonuses], ['Approved overtime', p.overtimePay]];
  return `<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0F1B2D;padding:32px;max-width:640px}h1{color:#0B1F3A;margin:0}
  .m{color:#5D6B82;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:8px;border-bottom:1px solid #E1E8F2}td+td{text-align:right}.t td{font-weight:700;border-top:2px solid #0B1F3A}</style></head><body>
  <h1>Payslip</h1><div class="m">${esc(name)} · ${esc(formatDate(p.periodStart))} – ${esc(formatDate(p.periodEnd))}</div>
  <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${formatMoney(v)}</td></tr>`).join('')}<tr class="t"><td>Gross pay</td><td>${formatMoney(p.grossPay)}</td></tr>
  ${(p.deductionBreakdown ?? []).map((d) => `<tr><td>− ${esc(d.name)}</td><td>${formatMoney(d.amount)}</td></tr>`).join('')}
  <tr class="t"><td>Net pay</td><td>${formatMoney(p.netPay)}</td></tr></table><p class="m">Status: ${esc(p.paymentStatus)}. Deductions are as configured by your employer.</p></body></html>`;
}

function PayslipSheet({ p, name, onClose }: { p: Payslip | null; name: string; onClose: () => void }) {
  if (!p) return <Sheet visible={false} title="" onClose={onClose}><View /></Sheet>;
  const line = (k: string, v: number, bold?: boolean) => <Row key={k} style={{ justifyContent: 'space-between' }}><T v={bold ? 'h3' : 'body'}>{k}</T><T v={bold ? 'h3' : 'body'}>{formatMoney(v)}</T></Row>;
  return (
    <Sheet visible onClose={onClose} title={`Payslip · ${formatDate(p.periodStart, { month: 'long', year: 'numeric' })}`}>
      {line('Basic salary', p.basicSalary)}{line('Allowances', p.allowances)}{line('Bonuses', p.bonuses)}{line('Approved overtime', p.overtimePay)}
      <Divider />{line('Gross pay', p.grossPay, true)}
      {(p.deductionBreakdown ?? []).map((d) => line(`− ${d.name}`, d.amount))}
      {p.deductions === 0 ? <T muted>No deductions configured.</T> : null}
      <Divider />{line('Net pay', p.netPay, true)}
      <Button title="Download PDF" icon={<Download size={16} color="#fff" />} onPress={() => exportPDF(payslipHtml(p, name), `payslip-${p.periodStart}`)} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- HR administration
function AdminPayroll() {
  const { c } = useTheme();
  const dir = useDirectory();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const data = useAsync(async () => {
    const [runs, audit] = await Promise.all([get<PayrollRun[]>('/payroll'), get<AuditLog[]>('/audit-logs', { entity: 'Payroll', limit: 12 })]);
    return { runs, items: runs.flatMap((r) => r.items), audit };
  }, []);

  const trend = useMemo(() => {
    const d = data.data; if (!d) return null;
    const runs = [...d.runs].reverse().slice(-12);
    const tot = (id: string, f: keyof PayrollItem) => sum(d.items.filter((x) => x.payrollId === id).map((x) => Number(x[f])));
    return { labels: runs.map((r) => monthLabel(r.periodStart)), gross: runs.map((r) => tot(r.id, 'grossPay')), net: runs.map((r) => tot(r.id, 'netPay')), bonus: runs.map((r) => tot(r.id, 'bonuses')), ded: runs.map((r) => tot(r.id, 'deductions')), basic: runs.map((r) => tot(r.id, 'basicSalary')) };
  }, [data.data]);

  const toast = useToast();
  const [ask, setAsk] = useState<{ fn: string; id: string; title: string; description: string; confirm: string; destructive?: boolean } | null>(null);

  const act = async (fn: string, args: Record<string, unknown>) => {
    setMsg(null);
    try {
      if (fn === 'approve_payroll_run') await patch(`/payroll/${args.id}/approve`);
      else if (fn === 'mark_payroll_paid') await patch(`/payroll/${args.id}/paid`);
      else if (fn === 'delete_draft_payroll_run') await httpDelete(`/payroll/${args.id}`);
      else await patch(`/payroll/items/${args.id}/bonus`, { bonus: args.bonus });
      toast.success({ approve_payroll_run: 'Payroll approved — payslips published', mark_payroll_paid: 'Payroll marked as paid', delete_draft_payroll_run: 'Draft deleted', set_payroll_bonus: 'Bonus updated' }[fn] ?? 'Done');
      data.reload();
    } catch (e) { setMsg(errMsg(e)); toast.error('Payroll action failed', errMsg(e)); }
  };

  return (
    <Screen title="Payroll" subtitle="Runs, approvals and payslips — HR administrators only"
      actions={<Row><Button small variant="secondary" title="Deduction rules" onPress={() => setRulesOpen(true)} /><Button title="New payroll run" onPress={() => setNewOpen(true)} /></Row>}>
      {msg ? <Banner tone="danger">{msg}</Banner> : null}
      <Async state={{ ...data, loading: data.loading || dir.loading }}>
        {(d) => {
          const last = d.runs[0];
          const lastItems = last ? d.items.filter((i) => i.payrollId === last.id) : [];
          const total = (f: keyof PayrollItem, xs = lastItems) => sum(xs.map((x) => Number(x[f])));
          const ytd = sum(d.items.filter((i) => d.runs.find((r) => r.id === i.payrollId)?.periodStart.slice(0, 4) === new Date().getFullYear().toString()).map((i) => Number(i.grossPay)));
          return (
            <>
              <Grid min={300}>
                <StatCard label="Total monthly payroll" value={formatMoney(total('netPay'))} sub={last ? `Net · ${monthLabel(last.periodStart)}` : 'No run yet'} icon={<HRIcon name="wallet" size="md" color={c.info} />} />
                <StatCard label="Gross salary cost" value={formatMoney(total('grossPay'))} sub={`YTD ${formatMoney(ytd)}`} icon={<HRIcon name="wallet" size="md" color={c.info} />} tone="info" />
                <StatCard label="Total deductions" value={formatMoney(total('deductions'))} sub="As configured by HR" icon={<HRIcon name="wallet" size="md" color={c.warning} />} tone="warning" />
                <StatCard label="Overtime expenses" value={formatMoney(total('overtimePay'))} sub={`Bonuses ${formatMoney(total('bonuses'))}`} icon={<HRIcon name="benefits" size="md" color={c.accent} />} tone="accent" />
                <StatCard label="Pending payroll" value={d.runs.filter((r) => r.status !== 'paid').length} sub={`${d.runs.filter((r) => r.status === 'draft').length} draft · ${d.runs.filter((r) => r.status === 'approved').length} awaiting payment`} icon={<HRIcon name="pending" size="md" color={c.warning} />} tone="warning" />
                <StatCard label="Completed payroll" value={d.runs.filter((r) => r.status === 'paid').length} sub="Runs paid" icon={<HRIcon name="completed" size="md" color={c.success} />} tone="success" />
              </Grid>
              {trend && trend.labels.length > 0 ? (
                <Grid min={340}>
                  <Card style={{ gap: 8 }}><T v="h3">Gross vs net payroll</T><LineChart labels={trend.labels} format={(n) => formatMoney(n).replace(/\.00$/, '')} series={[{ name: 'Gross', values: trend.gross }, { name: 'Net', values: trend.net }]} /></Card>
                  <Card style={{ gap: 8 }}><T v="h3">Bonuses & deductions</T><BarChart labels={trend.labels} format={(n) => formatMoney(n).replace(/\.00$/, '')} series={[{ name: 'Bonuses', values: trend.bonus }, { name: 'Deductions', values: trend.ded }]} /></Card>
                </Grid>
              ) : null}
              <Section title="Payroll runs">
                {d.runs.length === 0 ? <Card><T muted>No payroll runs yet. Create one for a month to calculate pay for active employees.</T></Card> : d.runs.map((r) => {
                  const its = d.items.filter((i) => i.payrollId === r.id);
                  const open = selected === r.id;
                  return (
                    <Card key={r.id} style={{ gap: 10 }}>
                      <Pressable onPress={() => setSelected(open ? null : r.id)}>
                        <Row style={{ justifyContent: 'space-between' }} wrap>
                          <View><T v="h3">{formatDate(r.periodStart, { month: 'long', year: 'numeric' })}</T><T v="small" muted>{its.length} employees · gross {formatMoney(total('grossPay', its))} · net {formatMoney(total('netPay', its))}</T></View>
                          <Badge label={label(r.status)} tone={toneFor(r.status)} />
                        </Row>
                      </Pressable>
                      {open ? (
                        <>
                          <Row wrap>
                            {r.status === 'draft' ? <Button small variant="success" title="Approve run" onPress={() => setAsk({ fn: 'approve_payroll_run', id: r.id, title: `Approve ${monthLabel(r.periodStart)} payroll?`, description: 'This publishes immutable payslips to every employee and locks the run. It cannot be edited afterwards.', confirm: 'Approve run' })} /> : null}
                            {r.status === 'approved' ? <Button small title="Mark as paid" onPress={() => setAsk({ fn: 'mark_payroll_paid', id: r.id, title: `Mark ${monthLabel(r.periodStart)} as paid?`, description: 'Payment status is recorded on every payslip.', confirm: 'Mark as paid' })} /> : null}
                            {r.status === 'draft' ? <Button small variant="danger" title="Delete draft" onPress={() => setAsk({ fn: 'delete_draft_payroll_run', id: r.id, title: 'Delete this draft run?', description: 'The calculated figures are discarded. You can process the month again.', confirm: 'Delete draft', destructive: true })} /> : null}
                            <Button small variant="secondary" title="Export CSV" onPress={() => exportCSV(`payroll-${r.periodStart.slice(0, 7)}`, its.map((i) => ({ employee: dir.empMap.get(i.employeeId)?.fullName, basic: i.basicSalary, allowances: i.allowances, bonuses: i.bonuses, overtime: i.overtimePay, deductions: i.deductions, gross: i.grossPay, net: i.netPay, status: i.paymentStatus })))} />
                          </Row>
                          <PayrollTable items={its} nameOf={(id) => dir.empMap.get(id)?.fullName ?? ''} codeOf={(id) => dir.empMap.get(id)?.employeeCode ?? ''} />
                          {r.status === 'draft' ? <T v="small" muted>Draft: adjust bonuses below, then approve.</T> : null}
                          {r.status === 'draft' ? its.map((i) => <ItemRow key={i.id} i={i} name={dir.empMap.get(i.employeeId)?.fullName ?? ''} editable onBonus={(b) => act('set_payroll_bonus', { id: i.id, bonus: b })} />) : null}
                        </>
                      ) : null}
                    </Card>
                  );
                })}
              </Section>
              <Section title="Recent payroll audit trail">
                <Card style={{ gap: 6 }}>{d.audit.length === 0 ? <T muted>No activity yet.</T> : d.audit.map((a) => <Row key={a.id} style={{ justifyContent: 'space-between' }}><T v="small">{a.action} · {a.entity}</T><T v="small" muted>{new Date(a.createdAt).toLocaleString('en-GB')}</T></Row>)}</Card>
              </Section>
              <ConfirmDialog visible={!!ask} title={ask?.title ?? ''} description={ask?.description} confirmText={ask?.confirm} destructive={ask?.destructive} onClose={() => setAsk(null)} onConfirm={() => { const a = ask!; setAsk(null); act(a.fn, { id: a.id }); }} />
              <NewRun open={newOpen} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); data.reload(); }} />
              <Rules open={rulesOpen} onClose={() => setRulesOpen(false)} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function ItemRow({ i, name, editable, onBonus }: { i: PayrollItem; name: string; editable: boolean; onBonus: (b: number) => void }) {
  const [b, setB] = useState(String(i.bonuses));
  return (
    <View style={{ gap: 4 }}>
      <Divider />
      <Row style={{ justifyContent: 'space-between' }} wrap><T v="h3">{name}</T><T v="h3">{formatMoney(Number(i.netPay))}</T></Row>
      <T v="small" muted>Basic {formatMoney(Number(i.basicSalary))} · Allow. {formatMoney(Number(i.allowances))} · OT {formatMoney(Number(i.overtimePay))} · Bonus {formatMoney(Number(i.bonuses))} · Deductions {formatMoney(Number(i.deductions))}</T>
      {editable ? <Row align="flex-start"><Field label="Bonus" value={b} onChangeText={setB} keyboardType="decimal-pad" /><View style={{ paddingTop: 22 }}><Button small variant="secondary" title="Set" onPress={() => { const n = Number(b); if (n >= 0) onBonus(n); }} /></View></Row> : null}
    </View>
  );
}

function NewRun({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [m, setM] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!validDate(m)) return setErr('Use a date in the month, e.g. 2026-01-01.');
    try { await post('/payroll/process', { month: m }); setErr(null); onDone(); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Sheet visible={open} onClose={onClose} title="New payroll run">
      <T muted>Calculates basic salary (annual ÷ 12), enrolled allowances, approved overtime and the deduction rules configured for each employee&apos;s country and contract. Review and add bonuses before approving.</T>
      <DateField label="Any date in the payroll month" value={m} onChange={setM} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Calculate run" onPress={go} />
    </Sheet>
  );
}

function Rules({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const data = useAsync(() => get<DeductionRule[]>('/payroll/rules'), []);
  const [name, setName] = useState(''); const [country, setCountry] = useState('GB'); const [kind, setKind] = useState<'percent_of_gross' | 'fixed'>('percent_of_gross');
  const [value, setValue] = useState(''); const [type, setType] = useState<EmploymentType | ''>(''); const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    if (!name.trim() || !(Number(value) >= 0) || value === '') return setErr('Name and a non-negative value are required.');
    try { await post('/payroll/rules', { name: name.trim(), country: country.toUpperCase(), kind, value: Number(value), employmentType: type || null }); setName(''); setValue(''); setErr(null); data.reload(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const toggle = async (r: DeductionRule) => { await patch(`/payroll/rules/${r.id}`, { active: !r.active }); data.reload(); };
  const remove = async (r: DeductionRule) => { await httpDelete(`/payroll/rules/${r.id}`); data.reload(); };
  return (
    <Sheet visible={open} onClose={onClose} title="Deduction rules">
      <Banner tone="warning">No tax or statutory formula is assumed. Only the rules you configure here are applied. Seeded demo rules are placeholders, not real tax rates.</Banner>
      {data.data?.map((r) => (
        <Row key={r.id} style={{ justifyContent: 'space-between' }} wrap>
          <View style={{ flexShrink: 1 }}><T v="h3">{r.name}</T><T v="small" muted>{r.country} · {r.employmentType ? label(r.employmentType) : 'All contracts'} · {r.kind === 'fixed' ? formatMoney(r.value) : `${r.value}% of gross`}</T></View>
          <Row><Button small variant={r.active ? 'success' : 'secondary'} title={r.active ? 'Active' : 'Off'} onPress={() => toggle(r)} /><Pressable onPress={() => remove(r)}><T v="small" color={c.danger}>Delete</T></Pressable></Row>
        </Row>))}
      <Divider />
      <Field label="Rule name" value={name} onChangeText={setName} />
      <Row><Field label="Country (ISO)" value={country} onChangeText={setCountry} maxLength={2} autoCapitalize="characters" /><Field label={kind === 'fixed' ? 'Amount' : 'Percent'} value={value} onChangeText={setValue} keyboardType="decimal-pad" /></Row>
      <Chips label="Type" value={kind} onChange={setKind} options={[{ value: 'percent_of_gross', label: '% of gross' }, { value: 'fixed', label: 'Fixed amount' }]} />
      <SelectField label="Applies to contract" value={type} onChange={setType} allowClear placeholder="All contracts" options={(['full_time', 'part_time', 'contract', 'intern'] as const).map((x) => ({ value: x, label: label(x) }))} />
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <Button title="Add rule" onPress={add} />
    </Sheet>
  );
}

interface PayRow { id: string; code: string; name: string; basic: number; allowances: number; overtime: number; deductions: number; net: number; status: string }

function PayrollTable({ items, nameOf, codeOf }: { items: PayrollItem[]; nameOf: (id: string) => string; codeOf: (id: string) => string }) {
  const rows: PayRow[] = items.map((i) => ({ id: i.id, code: codeOf(i.employeeId), name: nameOf(i.employeeId), basic: Number(i.basicSalary), allowances: Number(i.allowances), overtime: Number(i.overtimePay), deductions: Number(i.deductions), net: Number(i.netPay), status: i.paymentStatus }));
  const money = (v: unknown) => <T style={{ textAlign: 'right' }}>{formatMoney(Number(v))}</T>;
  const cols: TableColumn<PayRow>[] = [
    { id: 'code', header: 'Employee ID', accessorKey: 'code', sortable: true, minWidth: 100 },
    { id: 'name', header: 'Employee', accessorKey: 'name', sortable: true, minWidth: 140, cell: (v) => <T v="h3">{String(v)}</T> },
    { id: 'basic', header: 'Basic', accessorKey: 'basic', sortable: true, minWidth: 100, align: 'right', cell: money },
    { id: 'allowances', header: 'Allowances', accessorKey: 'allowances', minWidth: 100, align: 'right', cell: money },
    { id: 'overtime', header: 'Overtime', accessorKey: 'overtime', minWidth: 100, align: 'right', cell: money },
    { id: 'deductions', header: 'Deductions', accessorKey: 'deductions', minWidth: 100, align: 'right', cell: money },
    { id: 'net', header: 'Net salary', accessorKey: 'net', sortable: true, minWidth: 110, align: 'right', cell: (v) => <T v="h3" style={{ textAlign: 'right' }}>{formatMoney(Number(v))}</T> },
    { id: 'status', header: 'Status', accessorKey: 'status', minWidth: 90, cell: (v) => <Badge label={label(String(v))} tone={toneFor(String(v))} /> },
  ];
  return <Table<PayRow> data={rows} columns={cols} pagination pageSize={8} sortable searchable={false} emptyMessage="No employees in this run." />;
}
