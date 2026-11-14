import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DOCK_HEIGHT, dockClearance } from '@/components/layout/dock';
import { DOCK_TABS, labelFor, navFor } from '@/components/layout/nav';
import { Avatar, Badge, T } from '@/components/ui';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { useAnimatedLogout } from '@/hooks/useAnimatedLogout';
import { triggerHaptic } from '@/hooks/useHaptics';
import { useUnread } from '@/hooks/use-unread';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const CHEVRON = 16;
type Row = { href: string; text: string; icon: HRIconName };

/**
 * Settings row: [spacer | icon + label (centred as one group) | chevron]. The spacer matches the trailing slot's width,
 * so the chevron sits at the right edge without pulling the group off-centre. Rows grow with wrapped text.
 */
function SettingsRow({ icon, text, onPress, tone, trailing, chevron = true, animate, c }: {
  icon: HRIconName; text: string; onPress: () => void; tone?: 'danger'; trailing?: string; chevron?: boolean; animate?: boolean; c: ReturnType<typeof useTheme>['c'];
}) {
  const color = tone === 'danger' ? c.danger : c.text;
  return (
    <Pressable onPress={onPress} accessibilityRole={chevron ? 'link' : 'button'} accessibilityLabel={trailing ? `${text}, ${trailing}` : text}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingVertical: 10, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: CHEVRON }} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <HRIcon name={icon} size="md" color={tone === 'danger' ? c.danger : c.primary} animate={animate} />
        <T v="body" color={color} style={{ fontWeight: '500', flexShrink: 1, textAlign: 'center' }}>{text}</T>
        {trailing ? <T v="small" color={c.danger} style={{ fontWeight: '400' }}>{trailing}</T> : null}
      </View>
      <View style={{ width: CHEVRON, alignItems: 'flex-end' }}>{chevron ? <ChevronRight size={CHEVRON} color={c.muted} /> : null}</View>
    </Pressable>
  );
}

/**
 * More: every authorised destination that isn't a dock tab. A real screen (not a sheet), so it scrolls *beneath* the
 * floating Liquid Glass dock: the dock is the only glass layer here, the page itself stays solid and quiet.
 */
export default function More() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, profile, employee, signOut } = useAuth();
  const unread = useUnread();
  const { exiting, logout } = useAnimatedLogout(signOut);

  const rest = navFor(role).filter((n) => !(DOCK_TABS as readonly string[]).includes(n.href));
  const asRow = (n: (typeof rest)[number]): Row => ({ href: n.href, text: labelFor(n, role), icon: n.icon });
  const groups: { title: string; rows: Row[] }[] = [
    { title: 'People & HR Management', rows: rest.filter((n) => n.href !== '/settings').map(asRow) },
    { title: 'Personal & Account', rows: [
      ...(employee ? [{ href: `/employees/${employee.id}`, text: 'My Profile', icon: 'person' as HRIconName }] : []),
      { href: '/notifications', text: 'Notifications', icon: 'notifications' as HRIconName },
      ...rest.filter((n) => n.href === '/settings').map(asRow),
    ] },
  ].filter((g) => g.rows.length > 0);

  // pearl-white / deep-navy page, with soft grey / navy-grey grouped surfaces
  const base = dark ? '#0B1730' : '#FFFFFF';
  const group = { borderRadius: 16, backgroundColor: dark ? '#16294A' : '#F1F5F9', borderWidth: 1, borderColor: dark ? 'rgba(148,170,210,0.18)' : 'rgba(203,213,225,0.8)' } as const;
  const sep = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 14 }} />;
  const heading = (t: string) => <T v="h3" accessibilityRole="header" style={{ textAlign: 'center' }}>{t}</T>;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: base }}
      // the dock floats over the page: pad by exactly its footprint so Sign Out can scroll fully clear of it, no more
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: dockClearance(insets.bottom), gap: 22, width: '100%', maxWidth: 560, alignSelf: 'center' }}
      scrollIndicatorInsets={{ bottom: DOCK_HEIGHT + Math.max(insets.bottom - 6, 12) }}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled">
      {/* profile: the real signed-in user on one centred axis */}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={profile?.fullName ?? '?'} size={56} />
        <T v="h2" style={{ textAlign: 'center', marginTop: 4 }}>{profile?.fullName}</T>
        <T v="small" muted style={{ textAlign: 'center' }}>{profile?.email}</T>
        <Badge label={role === 'admin' ? 'Admin / HR' : role === 'manager' ? 'Manager' : 'Staff'} tone="primary" />
      </View>

      {groups.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          {heading(g.title)}
          <View style={group}>
            {g.rows.map((n, i) => (
              <View key={n.href}>
                {i > 0 ? sep : null}
                <SettingsRow c={c} icon={n.icon} text={n.text} trailing={n.href === '/notifications' && unread > 0 ? `${unread} new` : undefined}
                  onPress={() => { triggerHaptic('selection'); router.push(n.href as never); }} />
              </View>
            ))}
            {g.title === 'Personal & Account' ? (
              <>
                {sep}
                {/* Appearance: label group stays centred; the toggle takes the trailing slot, balanced by a spacer of equal width */}
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, paddingHorizontal: 8 }}>
                  <View style={{ width: 40 }} />
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <HRIcon name="appearance" size="md" color={c.primary} />
                    <T v="body" style={{ fontWeight: '500', flexShrink: 1, textAlign: 'center' }}>Appearance</T>
                  </View>
                  <ModeToggle variant="outline" size="icon" />
                </View>
              </>
            ) : null}
          </View>
        </View>
      ))}

      <View style={{ gap: 8 }}>
        {heading('Security')}
        <View style={group}>
          <SettingsRow c={c} icon="logout" text="Sign Out" tone="danger" chevron={false} animate={exiting}
            onPress={() => { triggerHaptic('impact-light'); logout(); }} />
        </View>
      </View>
    </ScrollView>
  );
}
