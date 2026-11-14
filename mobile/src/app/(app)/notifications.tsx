import { HRIcon } from '@/components/ui/hr-icon';
import { Pressable, View } from 'react-native';
import { Async, Button, Card, Divider, Screen, T } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import type { AppNotification } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { get, patch, post } from '@/services/api';

export default function Notifications() {
  const { c } = useTheme();
  const data = useAsync(() => get<{ items: AppNotification[]; unread: number }>('/notifications'), []);
  const mark = async (id?: string) => {
    await (id ? patch(`/notifications/${id}/read`) : post('/notifications/read-all'));
    data.reload();
  };
  return (
    <Screen title="Notifications" subtitle="Leave decisions, approvals, payslips and training"
      actions={<Button small variant="secondary" title="Mark all as read" onPress={() => mark()} />}>
      <Async state={data} empty={(d) => d.items.length === 0}>
        {({ items }) => (
          <Card pad={false}>
            {items.map((n, i) => (
              <View key={n.id}>{i > 0 ? <Divider /> : null}
                <Pressable onPress={() => !n.isRead && mark(n.id)} style={{ padding: 14, flexDirection: 'row', gap: 12, backgroundColor: n.isRead ? 'transparent' : c.primarySoft }}>
                  <HRIcon name={n.isRead ? 'notifications' : 'alertBell'} size="md" color={n.isRead ? c.muted : c.primary} />
                  <View style={{ flex: 1 }}><T v="h3">{n.title}</T>{n.body ? <T muted>{n.body}</T> : null}<T v="small" muted>{new Date(n.createdAt).toLocaleString('en-GB')}</T></View>
                </Pressable>
              </View>))}
          </Card>
        )}
      </Async>
    </Screen>
  );
}
