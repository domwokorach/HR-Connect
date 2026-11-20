import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { BarChart, LineChart, PieChart } from '@/components/charts';
import { Table, type TableColumn } from '@/components/ui/table';
import { Async, Badge, Banner, Button, Card, Grid, Screen, Section, StatCard, T, label, useToast } from '@/components/ui';
import { HRIcon } from '@/components/ui/hr-icon';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { formatMoney } from '@/lib/calc';
import { useAsync } from '@/lib/use-async';
import { errMsg } from '@/features/shared';
import { get, post } from '@/services/api';

type CardStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'DECLINED' | 'FAILED' | 'REVERSED' | 'REFUNDED' | 'UNDER_REVIEW';
interface Tx { id: string; providerReference: string | null; amountMinor: number; currency: string; status: CardStatus; providerStatus: string | null; businessRefType: string | null; businessRefId: string | null; createdAt: string; updatedAt: string }
interface Summary {
  totals: { count: number; volumeMinor: number; capturedMinor: number; refundedMinor: number; netCapturedMinor: number };
  byStatus: { status: CardStatus; count: number }[]; counts: { completed: number; pending: number; declined: number; refunded: number };
  daily: { date: string; count: number; capturedMinor: number; declined: number; refundedMinor: number }[]; byHour: { hour: number; count: number }[];
  currency: string | null; lastSyncAt: string | null;
}
interface Status { configured: boolean; configuredEnvironment: string | null; connectivity: 'ok' | 'error' | 'not_configured'; authentication: 'verified' | 'failed' | 'unverified'; verifiedProducts: string[]; lastSuccessAt: string | null; lastErrorCategory: string | null; webhookKeyConfigured: boolean }

const POLL_MS = 15_000;
const TONE: Record<CardStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { CAPTURED: 'success', AUTHORIZED: 'info', PENDING: 'warning', UNDER_REVIEW: 'warning', DECLINED: 'danger', FAILED: 'danger', REVERSED: 'neutral', REFUNDED: 'neutral' };
const minor = (n: number, cur: string | null) => formatMoney(n / 100, cur ?? 'GBP');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Re-runs `reload` on an interval while the screen is focused and the app is in the foreground, and once on return. */
function useLiveRefresh(reload: () => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const start = useCallback(() => { stop(); timer.current = setInterval(reload, POLL_MS); }, [reload]);
  useFocusEffect(useCallback(() => {
    reload(); start();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { reload(); start(); } else stop(); });
    return () => { stop(); sub.remove(); };
  }, [reload, start]));
}

export default function Payments() {
  const { role } = useAuth();
  if (role !== 'admin') return <Redirect href="/" />;
  return <AdminPayments />;
}

function AdminPayments() {
  const toast = useToast();
  const { c } = useTheme();
  const summary = useAsync(() => get<Summary>('/payments/summary'), []);
  const txs = useAsync(() => get<{ items: Tx[] }>('/payments/transactions', { limit: 50 }), []);
  const conn = useAsync(() => get<Status>('/payments/status'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const reloadAll = useCallback(() => { summary.reload(); txs.reload(); }, [summary.reload, txs.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(reloadAll);

  const reconcile = async (id: string) => {
    setBusy(id);
    try { await post(`/payments/transactions/${id}/reconcile`, {}); reloadAll(); toast.success('Reconciled with provider'); } catch (e) { toast.error('Reconcile failed', errMsg(e)); } finally { setBusy(null); }
  };

  const cols: TableColumn<Tx>[] = [
    { id: 'ref', header: 'Reference', accessorKey: 'providerReference', minWidth: 150, cell: (v, r) => <T v="small">{v ?? r.id.slice(0, 8)}</T> },
    { id: 'created', header: 'Date', accessorKey: 'createdAt', minWidth: 130, sortable: true, cell: (v) => <T v="small">{when(v)}</T> },
    { id: 'type', header: 'Type', accessorKey: 'id', minWidth: 100, cell: () => <T v="small">Card payment</T> },
    { id: 'amt', header: 'Amount', accessorKey: 'amountMinor', minWidth: 110, align: 'right', sortable: true, cell: (v, r) => <T v="small">{minor(v, r.currency)}</T> },
    { id: 'st', header: 'Status', accessorKey: 'status', minWidth: 130, cell: (v: CardStatus, r) => <Badge label={label(v.toLowerCase())} tone={TONE[v]} /> },
    { id: 'rec', header: 'Linked record', accessorKey: 'businessRefType', minWidth: 130, cell: (v, r) => <T v="small" muted>{v ? `${v} ${r.businessRefId ?? ''}` : '—'}</T> },
    { id: 'upd', header: 'Updated', accessorKey: 'updatedAt', minWidth: 130, cell: (v) => <T v="small" muted>{when(v)}</T> },
    { id: 'act', header: '', accessorKey: 'id', minWidth: 120, cell: (v) => <Button title="Reconcile" small variant="secondary" loading={busy === v} onPress={() => reconcile(v)} /> },
  ];

  return (
    <Screen title="Visa Payments & Transactions" subtitle="Live card payments reconciled with Cybersource" actions={<Button title="Refresh" small variant="secondary" onPress={() => { reloadAll(); conn.reload(); }} />}>
      <Async state={conn}>
        {(c) => c.connectivity === 'ok' && c.authentication === 'verified'
          ? <Banner tone="success">Connected to Cybersource ({c.configuredEnvironment}). Verified products: {c.verifiedProducts.join(', ') || 'none'}.{c.webhookKeyConfigured ? '' : ' Webhook key not set: updates rely on reconciliation.'}</Banner>
          : c.connectivity === 'not_configured' ? <Banner tone="warning">Cybersource is not configured on the server. No payment data will appear until credentials are added.</Banner>
          : <Banner tone="danger">Cybersource connection problem{c.lastErrorCategory ? ` (${c.lastErrorCategory})` : ''}. Existing records may be out of date.</Banner>}
      </Async>
      <Async state={summary}>
        {(s) => (
          <View style={{ gap: 16 }}>
            <Grid min={170}>
              <StatCard label="Total volume" value={minor(s.totals.volumeMinor, s.currency)} icon={<HRIcon name="wallet" size="md" color={c.info} />} sub={`${s.totals.count} transactions`} />
              <StatCard label="Completed" value={s.counts.completed} tone="success" icon={<HRIcon name="tick" size="md" color={c.info} />} />
              <StatCard label="Pending" value={s.counts.pending} tone="warning" icon={<HRIcon name="pending" size="md" color={c.info} />} />
              <StatCard label="Declined" value={s.counts.declined} tone="danger" icon={<HRIcon name="overdue" size="md" color={c.info} />} />
              <StatCard label="Refunded" value={s.counts.refunded} tone="info" icon={<HRIcon name="reports" size="md" color={c.info} />} />
              <StatCard label="Net captured" value={minor(s.totals.netCapturedMinor, s.currency)} tone="accent" icon={<HRIcon name="wallet" size="md" color={c.info} />} />
            </Grid>
            <T v="small" muted>Last synchronised {s.lastSyncAt ? when(s.lastSyncAt) : 'never'} · auto-refreshes every {POLL_MS / 1000}s</T>
            {s.totals.count === 0 ? <Banner tone="info">No card transactions have been recorded yet.</Banner> : (
              <Grid min={320}>
                <Card><T v="h3">Captured volume (30 days)</T><LineChart labels={s.daily.map((d) => d.date.slice(5))} series={[{ name: 'Captured', values: s.daily.map((d) => d.capturedMinor / 100) }]} format={(n) => formatMoney(n, s.currency ?? 'GBP')} /></Card>
                <Card><T v="h3">Successful vs declined</T><BarChart labels={s.daily.map((d) => d.date.slice(5))} series={[{ name: 'All', values: s.daily.map((d) => d.count - d.declined) }, { name: 'Declined', values: s.daily.map((d) => d.declined) }]} stacked /></Card>
                <Card><T v="h3">Refund trend</T><BarChart labels={s.daily.map((d) => d.date.slice(5))} series={[{ name: 'Refunded', values: s.daily.map((d) => d.refundedMinor / 100) }]} format={(n) => formatMoney(n, s.currency ?? 'GBP')} /></Card>
                <Card><T v="h3">By status</T><PieChart data={s.byStatus.map((b) => ({ label: label(b.status.toLowerCase()), value: b.count }))} /></Card>
                <Card><T v="h3">Activity by hour (UTC)</T><BarChart labels={s.byHour.map((h) => String(h.hour))} series={[{ name: 'Transactions', values: s.byHour.map((h) => h.count) }]} /></Card>
              </Grid>
            )}
          </View>
        )}
      </Async>
      <Section title="Transactions">
        <Async state={txs} empty={(d) => d.items.length === 0}>
          {(d) => <Table<Tx> data={d.items} columns={cols} pagination pageSize={10} sortable searchable={false} emptyMessage="No transactions." />}
        </Async>
      </Section>
    </Screen>
  );
}
