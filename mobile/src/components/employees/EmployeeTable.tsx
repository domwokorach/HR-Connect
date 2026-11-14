import { useRouter } from 'expo-router';
import { Eye, Pencil } from 'lucide-react-native';
import { View } from 'react-native';
import { Avatar, Badge, Button, Row, T, label, toneFor } from '@/components/ui';
import { Table, type TableColumn } from '@/components/ui/table';
import type { Employee } from '@/lib/types';

interface Row_ { id: string; name: string; code: string; role: string; department: string; email: string; status: string; manager: string }

/** Desktop/tablet directory: BNA Table with sorting + pagination. Salary and private contact data are never listed here. */
export function EmployeeTable({ employees, managerName, canEdit }: { employees: Employee[]; managerName: (id: string | null) => string; canEdit: boolean }) {
  const router = useRouter();
  const rows: Row_[] = employees.map((e) => ({ id: e.id, name: e.fullName, code: e.employeeCode, role: e.jobTitle || '—', department: e.department?.name ?? '—', email: e.email, status: e.status, manager: managerName(e.managerId) }));
  const columns: TableColumn<Row_>[] = [
    { id: 'avatar', header: '', accessorKey: 'name', width: 48, cell: (_v, r) => <Avatar name={r.name} size={32} /> },
    { id: 'code', header: 'Employee ID', accessorKey: 'code', sortable: true, minWidth: 96 },
    { id: 'name', header: 'Full name', accessorKey: 'name', sortable: true, minWidth: 140, cell: (v) => <T v="h3" numberOfLines={1}>{String(v)}</T> },
    { id: 'role', header: 'Role', accessorKey: 'role', sortable: true, minWidth: 120 },
    { id: 'department', header: 'Department', accessorKey: 'department', sortable: true, minWidth: 120 },
    { id: 'email', header: 'Email', accessorKey: 'email', sortable: true, minWidth: 210, cell: (v) => <T numberOfLines={1}>{String(v)}</T> },
    { id: 'status', header: 'Status', accessorKey: 'status', sortable: true, minWidth: 100, cell: (v) => <Badge label={label(String(v))} tone={toneFor(String(v))} /> },
    { id: 'manager', header: 'Manager', accessorKey: 'manager', sortable: true, minWidth: 110 },
    { id: 'actions', header: 'Actions', accessorKey: 'id', minWidth: 160, cell: (_v, r) => (
      <Row gap={6}>
        <Button small variant="secondary" title="View" icon={<Eye size={16} color="#64748B" />} onPress={() => router.push(`/employees/${r.id}` as never)} />
        {canEdit ? <Button small variant="ghost" title="Edit" icon={<Pencil size={16} color="#2563EB" />} onPress={() => router.push(`/employees/${r.id}?edit=1` as never)} /> : null}
      </Row>) },
  ];
  return (
    <View accessibilityLabel="Employee directory table">
      <Table<Row_> data={rows} columns={columns} pagination pageSize={10} sortable searchable={false} emptyMessage="No employees match your filters." onRowPress={(r) => router.push(`/employees/${r.id}` as never)} />
    </View>
  );
}
