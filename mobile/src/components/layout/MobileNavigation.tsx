import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HRIcon } from '@/components/ui/hr-icon';
import { useUnread } from '@/hooks/use-unread';
import { useAuth } from '@/lib/auth';
import { useAppFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';
import { DOCK_HEIGHT } from './dock';
import { GlassSurface } from './GlassSurface';
import { DOCK_TABS, isActive, navFor } from './nav';

const TAB_LABELS: Record<string, string> = { '/': 'Dashboard', '/attendance': 'Attendance', '/leave': 'Leave', '/employees': 'Employees' };

/** Floating Liquid Glass tab bar: Dashboard | Attendance | Leave | Employees | More (permission-aware). */
export function MobileNavigation() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { role } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const unread = useUnread();
  const med = useAppFont('500');
  const reduce = useReducedMotion();
  const items = navFor(role);
  const tabs = DOCK_TABS.map((h) => items.find((n) => n.href === h)).filter((n): n is NonNullable<typeof n> => !!n);
  const rest = items.filter((n) => !tabs.includes(n));
  const moreActive = rest.some((n) => isActive(n.href, path)) || path.startsWith('/notifications') || path.startsWith('/more');
  const count = tabs.length + 1;
  const activeIndex = moreActive ? tabs.length : Math.max(0, tabs.findIndex((n) => isActive(n.href, path)));

  const inner = Math.max(0, width - 12);
  const slot = inner / count;
  const x = useSharedValue(0);
  useEffect(() => {
    const to = 6 + activeIndex * slot;
    x.value = reduce || !slot ? withTiming(to, { duration: 0 }) : withSpring(to, { damping: 20, stiffness: 220, mass: 0.8 });
  }, [activeIndex, slot, reduce, x]);
  const capsule = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const tap = (fn: () => void) => () => { if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {}); fn(); };
  const activeTint = dark ? '#FFFFFF' : '#0B1730';
  const idleTint = dark ? '#94A3B8' : '#475569';
  const cell = (on: boolean) => ({ flex: 1, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 3 });

  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom - 6, 12) }}>
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="tablist"
          style={{ height: DOCK_HEIGHT, borderRadius: DOCK_HEIGHT / 2, overflow: 'hidden', borderWidth: 1, borderColor: dark ? 'rgba(148,170,210,0.28)' : 'rgba(203,213,225,0.9)',
            shadowColor: dark ? '#000' : '#0B1730', shadowOpacity: dark ? 0.4 : 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } }}>
          <GlassSurface dark={dark} />
          {slot > 0 ? (
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 6, bottom: 6, width: slot, borderRadius: (DOCK_HEIGHT - 12) / 2, backgroundColor: dark ? 'rgba(148,170,210,0.20)' : 'rgba(36,59,96,0.10)', borderWidth: 1, borderColor: dark ? 'rgba(190,205,235,0.22)' : 'rgba(255,255,255,0.8)' }, capsule]} />
          ) : null}
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 6, alignItems: 'center' }}>
            {tabs.map((n) => {
              const on = n.href === (activeIndex < tabs.length ? tabs[activeIndex].href : '');
              const label = TAB_LABELS[n.href] ?? n.short;
              return (
                <Pressable key={n.href} onPress={tap(() => router.push(n.href as never))} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ ...cell(on), transform: [{ scale: pressed && !reduce ? 0.94 : 1 }] })}>
                  <HRIcon name={n.icon} size="nav" color={on ? activeTint : idleTint} animate={on} />
                  <Text style={[{ fontSize: 11, color: on ? activeTint : idleTint }, med]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={tap(() => router.push('/more' as never))} accessibilityRole="tab" accessibilityLabel={`More${unread ? `, ${unread} unread notifications` : ''}`} accessibilityState={{ selected: activeIndex === tabs.length }}
              style={({ pressed }) => ({ ...cell(false), transform: [{ scale: pressed && !reduce ? 0.94 : 1 }] })}>
              <View><HRIcon name="more" size="nav" color={activeIndex === tabs.length ? activeTint : idleTint} animate={activeIndex === tabs.length} />{unread > 0 ? <View style={{ position: 'absolute', right: -5, top: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: c.solid.danger }} /> : null}</View>
              <Text style={[{ fontSize: 11, color: activeIndex === tabs.length ? activeTint : idleTint }, med]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>More</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </>
  );
}
