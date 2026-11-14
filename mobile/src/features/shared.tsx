import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { get } from '@/services/api';
import type { Department, Employee } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { Field } from '@/components/ui';

export const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
export const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validDate = (s: string) => isoDateRe.test(s) && !Number.isNaN(Date.parse(s));

/** Everyone in the company directory + departments, with lookup maps. */
export function useDirectory() {
  const state = useAsync(async () => {
    const [employees, departments] = await Promise.all([get<Employee[]>('/employees'), get<Department[]>('/departments')]);
    return { employees, departments };
  }, []);
  const maps = useMemo(() => {
    const emp = new Map((state.data?.employees ?? []).map((x) => [x.id, x]));
    const dep = new Map((state.data?.departments ?? []).map((x) => [x.id, x]));
    return { emp, dep };
  }, [state.data]);
  return { ...state, employees: state.data?.employees ?? [], departments: state.data?.departments ?? [], empMap: maps.emp, depMap: maps.dep };
}

/** Employees the signed-in user is responsible for: everyone (admin), their reports + self (manager), self (staff). */
export function useScope(employees: Employee[]) {
  const { role, employee } = useAuth();
  return useMemo(() => {
    const active = employees.filter((e) => e.status !== 'inactive');
    if (role === 'admin') return active;
    if (role === 'manager') return active.filter((e) => e.managerId === employee?.id || e.id === employee?.id);
    return active.filter((e) => e.id === employee?.id);
  }, [employees, role, employee]);
}

export function DateField(p: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const bad = p.value.length > 0 && !validDate(p.value);
  return <Field label={p.label} value={p.value} onChangeText={p.onChange} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} error={bad ? 'Use YYYY-MM-DD' : null} hint={p.hint} />;
}

export { errorMessage as errMsg } from '@/services/api';
