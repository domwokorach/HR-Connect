import { usePathname, useRouter } from 'expo-router';
import { appFont } from '@/theme/typography';
import { Menu } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Avatar } from '@/components/ui';
import { HRIcon } from '@/components/ui/hr-icon';
import { Logo } from '@/components/brand/Logo';
import { useUnread } from '@/hooks/use-unread';
import { useAuth } from '@/lib/auth';
import { useAppFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';
import { GlassButton, GlassCluster } from './GlassButton';
import { GlassSurface } from './GlassSurface';
import { MobileDrawer } from './MobileDrawer';
import { NAV, isActive, labelFor } from './nav';

const CONTENT_HEIGHT = 60;
const SIDE = 96; // bell (44) + gap (8) + avatar target (44): both sides reserve at least this
const SIDE_WIDE = 190; // logo mark + wordmark; the right side matches it so the title stays centred
const WORDMARK_MIN_WIDTH = 560; // below this the title wins over the "HR Connect" wordmark

/** Tab screens use the dock's short labels; other screens (reached via More) use their full nav label. */
function useScreenTitle() {
  const path = usePathname();
  const { role } = useAuth();
  if (path.startsWith('/notifications')) return 'Notifications';
  if (path.startsWith('/more')) return 'More';
  const item = [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(n.href, path));
  if (!item) return 'HR Connect';
  return item.mobileTab ? item.short : labelFor(item, role);
}

/** Compact Liquid Glass top bar for phones: brand · screen title · notifications + profile. Sits in flow, so it never covers content. */
export function MobileHeader() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const router = useRouter();
  const reduce = useReducedMotion();
  const { profile, employee } = useAuth();
  const unread = useUnread();
  const regular = useAppFont('400');
  const bold = useAppFont('700');
  const [width, setWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = useScreenTitle();
  const showWordmark = width >= WORDMARK_MIN_WIDTH;
  const ink = dark ? '#FFFFFF' : '#0B1730';
  const icon = dark ? '#B4C2DC' : '#475569';
  const profilePath = employee ? `/employees/${employee.id}` : '/settings';

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="header"
      style={{ overflow: 'hidden', zIndex: 30, borderBottomWidth: 1, borderBottomColor: dark ? 'rgba(148,170,210,0.22)' : 'rgba(203,213,225,0.9)',
        shadowColor: dark ? '#000' : '#0B1730', shadowOpacity: dark ? 0.3 : 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <GlassSurface dark={dark} />
      <View style={{ height: CONTENT_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        {/* equal flex-grown sides around a content-sized title: the title is centred on the bar, and can never be overlapped */}
        <View style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0, minWidth: showWordmark ? SIDE_WIDE : SIDE, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GlassButton dark={dark} label="Open menu" onPress={() => setMenuOpen(true)}><Menu size={20} color={icon} /></GlassButton>
          <View style={{ width: 30, height: 30 }}><Logo mark variant={dark ? 'onDark' : 'onLight'} maxWidth={30} /></View>
          {showWordmark ? <Text numberOfLines={1} style={[{ color: ink, fontSize: 15 }, bold]}>HR Connect</Text> : null}
        </View>
        <View style={{ flexGrow: 0, flexShrink: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 4 }}>
          <Animated.View key={title} entering={reduce ? undefined : FadeIn.duration(180)} style={{ maxWidth: '100%' }}>
            <Text numberOfLines={2} accessibilityRole="header" maxFontSizeMultiplier={1.15} style={[{ color: ink, fontSize: 17, lineHeight: 21, textAlign: 'center' }, regular]}>{title}</Text>
          </Animated.View>
        </View>
        <View style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0, minWidth: showWordmark ? SIDE_WIDE : SIDE, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          <GlassCluster gap={4}>
          <GlassButton dark={dark} label={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications' as never)}>
            <HRIcon name="notifications" size="md" color={icon} animate={unread} />
            {unread > 0 ? (
              <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: c.solid.danger, borderWidth: 1.5, borderColor: dark ? '#0B1730' : '#FFFFFF' }}>
                <Text style={[{ color: '#fff', fontSize: 10 }, appFont('700')]}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </GlassButton>
          <GlassButton dark={dark} label={`Profile, ${profile?.fullName ?? 'account'}`} onPress={() => router.push(profilePath as never)}>
            <Avatar name={profile?.fullName ?? '?'} size={32} />
          </GlassButton>
          </GlassCluster>
        </View>
      </View>
      <MobileDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}
