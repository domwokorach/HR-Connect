import { usePathname, useRouter } from 'expo-router';
import { appFont } from '@/theme/typography';
import { ChevronRight, Search } from 'lucide-react-native';
import { HRIcon } from '@/components/ui/hr-icon';
import { useAnimatedLogout } from '@/hooks/useAnimatedLogout';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Avatar, Row, T, useBreakpoint } from '@/components/ui';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEmployeeSearch } from '@/hooks/use-employee-search';
import { useUnread } from '@/hooks/use-unread';
import { useAuth } from '@/lib/auth';
import { useAppFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';
import { sizes } from '@/theme/spacing';
import { NAV, isActive, labelFor } from './nav';

export function useBreadcrumbs() {
  const path = usePathname();
  const { role } = useAuth();
  const item = [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(n.href, path));
  const title = item ? labelFor(item, role) : path.startsWith('/notifications') ? 'Notifications' : 'HR Connect';
  const crumbs = ['Home', ...(item && item.href !== '/' ? [item.group, title] : ['Dashboard'])];
  const detail = path.split('/').filter(Boolean)[1];
  if (detail) { crumbs.push(detail === 'new' ? 'New' : 'Profile'); }
  return { title, crumbs, item };
}

function SearchBox() {
  const { c } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const results = useEmployeeSearch(q, focus);
  const med = useAppFont('500');
  return (
    <View style={{ width: 320, zIndex: 20 }}>
      <Row style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: focus ? c.primary : 'transparent' }}>
        <Search size={16} color={c.muted} />
        <TextInput value={q} onChangeText={setQ} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} placeholder="Search employees…" placeholderTextColor={c.muted}
          accessibilityLabel="Search employees" style={[{ flex: 1, color: c.text, fontSize: 14, outlineStyle: 'none' } as object, med]} />
      </Row>
      {focus && q.trim().length >= 2 ? (
        <View style={{ position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}>
          {results.length === 0 ? <T muted style={{ padding: 10 }}>No matching employees</T> : results.map((e) => (
            <Pressable key={e.id} onPress={() => { setQ(''); router.push(`/employees/${e.id}` as never); }} accessibilityRole="link" accessibilityLabel={e.fullName}
              style={({ hovered }: { hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, backgroundColor: hovered ? c.surfaceAlt : 'transparent' })}>
              <Avatar name={e.fullName} size={30} />
              <View><T v="h3">{e.fullName}</T><T v="small" muted>{e.jobTitle || e.employeeCode}</T></View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AppHeader() {
  const { c } = useTheme();
  const router = useRouter();
  const { isTablet, isMobile } = useBreakpoint();
  const { profile, role, employee, signOut } = useAuth();
  const unread = useUnread();
  const { exiting, logout } = useAnimatedLogout(signOut);
  const { title, crumbs } = useBreadcrumbs();
  const regular = useAppFont('400');
  const medium = useAppFont('500');

  const bell = (
    <Pressable onPress={() => router.push('/notifications' as never)} accessibilityRole="button" accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`} hitSlop={8}
      style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }}>
      <HRIcon name="notifications" size="md" color={c.text} animate={unread} />
      {unread > 0 ? <View style={{ position: 'absolute', top: 4, right: 3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.solid.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={[{ color: '#fff', fontSize: 10 }, appFont('400')]}>{unread > 9 ? '9+' : unread}</Text></View> : null}
    </Pressable>
  );

  const account = (
    <Popover>
      <PopoverTrigger asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Account menu" hitSlop={6}><Avatar name={profile?.fullName ?? '?'} size={38} /></Pressable>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ minWidth: 220 }}>
        <View style={{ padding: 6, gap: 2 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}><T v="h3">{profile?.fullName}</T><T v="small" muted>{profile?.email}</T><T v="small" muted style={{ textTransform: 'capitalize' }}>{role === 'admin' ? 'Admin / HR' : role}</T></View>
          {employee ? <MenuItem icon={<HRIcon name="person" size="sm" color={c.text} />} text="My profile" onPress={() => router.push(`/employees/${employee.id}` as never)} /> : null}
          <MenuItem icon={<HRIcon name="settings" size="sm" color={c.text} />} text="Settings" onPress={() => router.push('/settings' as never)} />
          <MenuItem icon={<HRIcon name="logout" size="sm" color={c.solid.danger} animate={exiting} />} text="Log out" danger onPress={logout} />
        </View>
      </PopoverContent>
    </Popover>
  );

  return (
    <View style={{ height: isMobile ? 60 : sizes.header, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: isMobile ? 16 : 28, gap: 16, zIndex: 30 }} accessibilityRole="header">
      <View style={{ flex: 1, minWidth: 0 }}>
        {isTablet ? (
          <Row gap={6} wrap={false} style={{ minWidth: 0 }} aria-label="Breadcrumb">
            {crumbs.map((cr, i) => (
              <Row key={`${cr}-${i}`} gap={6} wrap={false}>
                {i > 0 ? <ChevronRight size={14} color={c.muted} /> : null}
                <Text numberOfLines={1} style={[{ fontSize: 13.5, color: i === crumbs.length - 1 ? c.text : c.muted }, i === crumbs.length - 1 ? regular : medium]}>{cr}</Text>
              </Row>
            ))}
          </Row>
        ) : (
          <Text numberOfLines={1} accessibilityRole="header" style={[{ color: c.text, fontSize: 18, lineHeight: 24 }, regular]}>{title}</Text>
        )}
      </View>
      {isTablet ? <SearchBox /> : null}
      <Row gap={10}>
        {bell}
        <ModeToggle variant="outline" size="icon" />
        {account}
      </Row>
    </View>
  );
}

function MenuItem({ icon, text, onPress, danger }: { icon: React.ReactNode; text: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="menuitem" accessibilityLabel={text}
      style={({ hovered }: { hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, backgroundColor: hovered ? c.surfaceAlt : 'transparent' })}>
      {icon}<T v="body" color={danger ? c.danger : c.text} style={{ fontWeight: '500' }}>{text}</T>
    </Pressable>
  );
}
