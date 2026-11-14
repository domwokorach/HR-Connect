import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import { Async, Avatar, Badge, Button, Card, Chips, Divider, EmptyState, Grid, Input, Row, Screen, SelectField, T, label, toneFor, useBreakpoint } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDirectory } from '@/features/shared';

export default function Employees() {
  const { role } = useAuth();
  const { c } = useTheme();
  const { isTablet } = useBreakpoint();
  const router = useRouter();
  const dir = useDirectory();
  const [q, setQ] = useState('');
  const params = useLocalSearchParams<{ department?: string }>();
  const [dept, setDept] = useState(params.department ?? '');
  const [jobRole, setJobRole] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'on_leave' | 'inactive'>('active');

  const list = useMemo(() => dir.employees.filter((e) => {
    if (status !== 'all' && e.status !== status) return false;
    if (dept && e.departmentId !== dept) return false;
    if (jobRole && e.jobTitle !== jobRole) return false;
    const s = q.trim().toLowerCase();
    return !s || [e.fullName, e.email, e.jobTitle, e.employeeCode].some((x) => x.toLowerCase().includes(s));
  }), [dir.employees, q, dept, jobRole, status]);

  const roles = useMemo(() => [...new Set(dir.employees.map((e) => e.jobTitle).filter(Boolean))].sort().map((r) => ({ value: r, label: r })), [dir.employees]);
  const managerName = (id: string | null) => dir.empMap.get(id ?? '')?.fullName ?? '—';

  return (
    <Screen title="Employees" subtitle={`${list.length} of ${dir.employees.length} people`}
      actions={role === 'admin' ? <Button title="Add employee" icon={<Plus size={16} color={c.onPrimary} />} onPress={() => router.push('/employees/new' as never)} /> : null}>
      <Card style={{ gap: 12 }}>
        <Input icon={Search} value={q} onChangeText={setQ} placeholder="Search employees" variant="outline" accessibilityLabel="Search employees" />
        <Row wrap align="flex-start">
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200 }}><SelectField label="Department" value={dept} onChange={setDept} allowClear placeholder="All departments" options={dir.departments.map((d) => ({ value: d.id, label: d.name }))} /></View>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200 }}><SelectField label="Job role" value={jobRole} onChange={setJobRole} allowClear placeholder="All roles" options={roles} /></View>
        </Row>
        <Chips label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
      </Card>
      <Async state={dir}>
        {() => list.length === 0 ? <Card><EmptyState title="No employees match your filters" body="Try clearing the search or choosing a different department." /></Card>
          : isTablet ? <EmployeeTable employees={list} managerName={managerName} canEdit={role === 'admin'} />
          : (
            <Grid min={260} gap={12}>
              {list.map((e) => (
                <Pressable key={e.id} onPress={() => router.push(`/employees/${e.id}` as never)} accessibilityRole="link" accessibilityLabel={`${e.fullName}, ${e.jobTitle}`}>
                  <Card style={{ gap: 10 }}>
                    <Row><Avatar name={e.fullName} />
                      <View style={{ flex: 1, minWidth: 0 }}><T v="h3" numberOfLines={2}>{e.fullName}</T><T v="small" muted numberOfLines={2}>{e.jobTitle || '—'}</T></View>
                      <Badge label={label(e.status)} tone={toneFor(e.status)} /></Row>
                    <Divider />
                    <Row style={{ justifyContent: 'space-between' }}><T v="small" muted>{e.employeeCode}</T><T v="small" muted>{e.department?.name ?? 'No department'}</T></Row>
                  </Card>
                </Pressable>
              ))}
            </Grid>
          )}
      </Async>
    </Screen>
  );
}
