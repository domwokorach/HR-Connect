import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Async, Avatar, Banner, Button, Card, EmptyState, Field, Grid, ProgressBar, Row, Screen, Sheet, T, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { pct } from '@/lib/calc';
import { useTheme } from '@/lib/theme';
import { errMsg, useDirectory } from '@/features/shared';
import { post } from '@/services/api';
import { HRIcon } from '@/components/ui/hr-icon';

/** Departments: real headcount from the employee directory. Only HR can create departments. */
export default function Departments() {
  const { role } = useAuth();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const dir = useDirectory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => dir.departments.map((d) => {
    const people = dir.employees.filter((e) => e.departmentId === d.id);
    const active = people.filter((e) => e.status === 'active');
    return { ...d, total: people.length, active: active.length, onLeave: people.filter((e) => e.status === 'on_leave').length, preview: active.slice(0, 5) };
  }), [dir.departments, dir.employees]);
  const totalActive = dir.employees.filter((e) => e.status === 'active').length;

  const create = async () => {
    if (!name.trim()) return setErr('Enter a department name.');
    setBusy(true); setErr(null);
    try { await post('/departments', { name: name.trim() }); toast.success('Department created', name.trim()); setOpen(false); setName(''); dir.reload(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Screen title="Departments" subtitle={`${dir.departments.length} departments · ${totalActive} active employees`}
      actions={role === 'admin' ? <Button title="Add department" icon={<Plus size={16} color={c.onPrimary} />} onPress={() => setOpen(true)} /> : null}>
      <Async state={dir} empty={() => rows.length === 0}>
        {() => rows.length === 0 ? <Card><EmptyState title="No departments yet" body="Create a department, then assign employees to it from their profile." /></Card> : (
          <Grid min={300} gap={16}>
            {rows.map((d) => (
              <Pressable key={d.id} onPress={() => router.push(`/employees?department=${d.id}` as never)} accessibilityRole="link" accessibilityLabel={`${d.name}, ${d.active} active employees`}>
                <Card style={{ gap: 14 }}>
                  {/* header: icon | name (wraps, takes the remaining width) | chevron — name never competes with the chevron for space */}
                  <Row gap={12} wrap={false}>
                    <View style={{ backgroundColor: c.primarySoft, width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><HRIcon name="departments" size="md" color={c.info} /></View>
                    <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}><T v="h3" accessibilityRole="header" style={{ fontSize: 17, lineHeight: 23, fontWeight: '600' }}>{d.name}</T></View>
                    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={20} color={c.muted} /></View>
                  </Row>
                  <Row wrap align="flex-end" style={{ justifyContent: 'space-between', rowGap: 8 }}>
                    <View style={{ flexShrink: 1, minWidth: 0 }}><T style={{ fontSize: 28, lineHeight: 34, fontWeight: '400' }}>{d.active}</T><T v="small" muted>active employees</T></View>
                    <View style={{ alignItems: 'flex-end', flexShrink: 1, minWidth: 0 }}><T v="small" muted>{d.onLeave} on leave</T><T v="small" muted>{pct(d.active, totalActive)}% of company</T></View>
                  </Row>
                  <ProgressBar value={pct(d.active, totalActive)} />
                  <Row gap={-8}>{d.preview.map((e) => <View key={e.id} style={{ marginRight: -8, borderWidth: 2, borderColor: c.surface, borderRadius: 999 }}><Avatar name={e.fullName} size={28} /></View>)}
                    {d.total > d.preview.length ? <T v="small" muted style={{ marginLeft: 14 }}>+{d.total - d.preview.length}</T> : null}</Row>
                </Card>
              </Pressable>
            ))}
          </Grid>
        )}
      </Async>
      <Sheet visible={open} onClose={() => setOpen(false)} title="New department">
        <Field label="Department name" required value={name} onChangeText={setName} placeholder="e.g. Customer Success" />
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <Button title="Create department" onPress={create} loading={busy} />
      </Sheet>
    </Screen>
  );
}
