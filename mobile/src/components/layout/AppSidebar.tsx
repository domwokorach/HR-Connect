import { usePathname, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';
import { useAnimatedLogout } from '@/hooks/useAnimatedLogout';
import { triggerHaptic } from '@/hooks/useHaptics';
import { useModeToggle } from '@/hooks/useModeToggle';
import { useUnread } from '@/hooks/use-unread';
import { useAuth } from '@/lib/auth';
import { useAppFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';
import { sizes } from '@/theme/spacing';
import { groupsFor, isActive, labelFor } from './nav';

/** Sidebar palette: light `#F8FAFC` surface / deep-navy `#0B1730` surface, with the navy active state. */
export function useSidebarColors() {
  const { scheme } = useTheme();
  return scheme === 'dark'
    ? { bg: '#0B1730', text: '#FFFFFF', muted: '#94A3B8', active: '#243B60', activeText: '#FFFFFF', border: 'rgba(148,170,210,0.18)', hover: 'rgba(148,170,210,0.10)', danger: '#F0A09A' }
    : { bg: '#F8FAFC', text: '#0B1730', muted: '#64748B', active: '#E2E8F0', activeText: '#243B60', border: '#E2E8F0', hover: 'rgba(15,23,42,0.05)', danger: '#B3261E' };
}

const ROW = { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 10 } as const;

function Item({ icon, label, on, collapsed, onPress, badge, tone, animate, role = 'link' }: {
  icon: HRIconName; label: string; on?: boolean; collapsed?: boolean; onPress: () => void; badge?: number; tone?: 'danger'; animate?: boolean; role?: 'link' | 'button';
}) {
  const k = useSidebarColors();
  const regular = useAppFont('400');
  const color = tone === 'danger' ? k.danger : on ? k.activeText : k.text;
  return (
    <Pressable onPress={onPress} accessibilityRole={role} accessibilityLabel={badge ? `${label}, ${badge} unread` : label} accessibilityState={{ selected: !!on }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [ROW, { justifyContent: collapsed ? 'center' : 'flex-start', backgroundColor: on ? k.active : pressed || hovered ? k.hover : 'transparent' }]}>
      <View>
        <HRIcon name={icon} size="md" color={on || tone ? color : k.muted} animate={animate} />
        {collapsed && badge ? <View style={{ position: 'absolute', top: -2, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} /> : null}
      </View>
      {!collapsed ? <Text style={[{ flex: 1, flexShrink: 1, minWidth: 0, color, fontSize: 14.5, lineHeight: 20 }, regular]}>{label}</Text> : null}
      {!collapsed && badge ? <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626' }}><Text style={{ color: '#fff', fontSize: 11 }}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

/**
 * The navigation itself, shared by the desktop/tablet sidebar and the phone drawer: fixed header, a menu that scrolls on its own,
 * and a fixed account footer, so Sign Out is always reachable. Only routes the signed-in role may open are listed.
 */
export function SidebarPanel({ collapsed = false, onNavigate, onClose, onToggleCollapse, bottomInset = 0 }: {
  collapsed?: boolean; onNavigate?: () => void; onClose?: () => void; onToggleCollapse?: () => void; bottomInset?: number;
}) {
  const k = useSidebarColors();
  const { scheme } = useTheme();
  const { role, profile, employee, settings, signOut } = useAuth();
  const { exiting, logout } = useAnimatedLogout(signOut);
  const { toggleMode } = useModeToggle();
  const unread = useUnread();
  const path = usePathname();
  const router = useRouter();
  const regular = useAppFont('400');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const go = (href: string) => { triggerHaptic('selection'); onNavigate?.(); router.push(href as never); };
  const profileHref = employee ? `/employees/${employee.id}` : '/settings';
  const roleText = role === 'admin' ? 'Admin / HR' : role === 'manager' ? 'Manager' : 'Staff';
  // Account items live in the footer; Notifications joins the analytics group. Neither adds a route that doesn't exist.
  const groups = groupsFor(role).filter((g) => g.name !== 'Account & Settings').map((g) => ({ ...g, extra: g.name === 'Analytics & Management' }));
  if (!groups.some((g) => g.extra)) groups.push({ name: 'Analytics & Management', items: [], extra: true });

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      {/* header: 72pt, logo 32 + name */}
      <View style={{ height: sizes.header, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: k.border }}>
        <View style={{ width: 32, height: 32 }}><Logo mark variant={scheme === 'dark' ? 'onDark' : 'onLight'} maxWidth={32} /></View>
        {!collapsed ? (
          <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={[{ color: k.text, fontSize: 17, lineHeight: 22 }, regular]}>HR Connect</Text>
            {settings.companyName ? <Text style={[{ color: k.muted, fontSize: 12, lineHeight: 16 }, regular]}>{settings.companyName}</Text> : null}
          </View>
        ) : null}
        {onClose ? <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={k.muted} /></Pressable> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 8 }} showsVerticalScrollIndicator={false}>
        {groups.map((g) => {
          const open = !closed[g.name];
          return (
            <View key={g.name} style={{ gap: 2 }}>
              {!collapsed ? (
                <Pressable onPress={() => setClosed({ ...closed, [g.name]: open })} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${g.name}, ${open ? 'collapse' : 'expand'}`}
                  style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                  <Text style={[{ flex: 1, flexShrink: 1, color: k.muted, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }, regular]}>{g.name}</Text>
                  {open ? <ChevronDown size={16} color={k.muted} /> : <ChevronRight size={16} color={k.muted} />}
                </Pressable>
              ) : <View style={{ height: 1, backgroundColor: k.border, marginVertical: 6, marginHorizontal: 12 }} />}
              {open || collapsed ? (
                <>
                  {g.items.map((n) => <Item key={n.href} icon={n.icon} label={labelFor(n, role)} on={isActive(n.href, path)} collapsed={collapsed} onPress={() => go(n.href)} />)}
                  {g.extra ? <Item icon="notifications" label="Notifications" on={isActive('/notifications', path)} collapsed={collapsed} badge={unread} onPress={() => go('/notifications')} /> : null}
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* account footer */}
      <View style={{ padding: 10, gap: 2, borderTopWidth: 1, borderTopColor: k.border, paddingBottom: 10 + bottomInset }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: collapsed ? 0 : 12, paddingVertical: 8, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Avatar name={profile?.fullName ?? '?'} size={36} />
          {!collapsed ? (
            <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
              <Text style={[{ color: k.text, fontSize: 14.5, lineHeight: 20 }, regular]}>{profile?.fullName}</Text>
              <Text style={[{ color: k.muted, fontSize: 12.5, lineHeight: 17 }, regular]}>{profile?.email ?? roleText}</Text>
            </View>
          ) : null}
        </View>
        <Item icon="person" label="My Profile" on={isActive(profileHref, path)} collapsed={collapsed} onPress={() => go(profileHref)} />
        <Item icon="settings" label="Settings" on={isActive('/settings', path)} collapsed={collapsed} onPress={() => go('/settings')} />
        <Item icon="appearance" label={scheme === 'dark' ? 'Appearance: Dark' : 'Appearance: Light'} collapsed={collapsed} role="button" onPress={toggleMode} />
        <Item icon="logout" label="Sign Out" tone="danger" collapsed={collapsed} role="button" animate={exiting} onPress={() => { onNavigate?.(); logout(); }} />
        {onToggleCollapse ? (
          <Pressable onPress={onToggleCollapse} accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={[ROW, { justifyContent: collapsed ? 'center' : 'flex-start' }]}>
            {collapsed ? <ChevronRight size={20} color={k.muted} /> : <ChevronLeft size={20} color={k.muted} />}
            {!collapsed ? <Text style={[{ color: k.muted, fontSize: 14, flex: 1 }, regular]}>Collapse</Text> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Desktop / tablet sidebar: expanded 260pt, icon-only 76pt, animated (instant under Reduce Motion). The content area flexes into the rest, so nothing overlaps. */
export function AppSidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const k = useSidebarColors();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const target = collapsed ? sizes.sidebarCollapsed : sizes.sidebar;
  const width = useAnimatedStyle(() => ({ width: reduce ? target : withTiming(target, { duration: 200 }) }), [target, reduce]);
  return (
    <Animated.View style={[{ overflow: 'hidden', borderRightWidth: 1, borderRightColor: k.border, backgroundColor: k.bg }, width]}>
      <SidebarPanel collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
    </Animated.View>
  );
}
