import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppShell } from '@/components/layout/PageContainer';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function AppLayout() {
  const { loading, user, profile } = useAuth();
  const { c } = useTheme();
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Redirect href={'/login' as never} />;
  if (!profile) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><Loading label="Loading your profile…" /></View>;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <AppShell />
    </SafeAreaView>
  );
}
