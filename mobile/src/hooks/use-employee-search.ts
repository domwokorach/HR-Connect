import { useEffect, useState } from 'react';
import type { Employee } from '@/lib/types';
import { get } from '@/services/api';

let cache: Employee[] | null = null;

/** Client-side filter over the (small) employee directory, fetched once per session. */
export function useEmployeeSearch(query: string, enabled: boolean) {
  const [all, setAll] = useState<Employee[]>(cache ?? []);
  useEffect(() => {
    if (!enabled || cache) return;
    get<Employee[]>('/employees').then((e) => { cache = e; setAll(e); }).catch(() => {});
  }, [enabled]);
  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : all.filter((e) => [e.fullName, e.email, e.jobTitle, e.employeeCode].some((x) => x.toLowerCase().includes(q))).slice(0, 6);
  return results;
}
export const clearEmployeeSearchCache = () => { cache = null; };
