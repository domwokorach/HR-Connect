import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { get } from '@/services/api';

/** Unread notification count; refreshed whenever the route changes. */
export function useUnread() {
  const { user } = useAuth();
  const path = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    get<{ unread: number }>('/notifications').then((r) => setN(r.unread)).catch(() => {});
  }, [user, path]);
  return n;
}
