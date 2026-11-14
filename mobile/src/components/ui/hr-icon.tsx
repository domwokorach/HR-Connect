import * as Lucide from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { GLYPH_FOR, ICON_SIZE, STATUS_TONE, STROKE, type Glyph } from './hr-icon-map';
import { useToneColor, type HRIconProps } from './hr-icon.shared';

export { GLYPH_FOR, ICON_SIZE, CONTAINER_SIZE, type HRIconName, type HRIconSize, type HRIconTone } from './hr-icon-map';
export { useToneColor, type HRIconProps } from './hr-icon.shared';

/** Native renders the same Lucide glyphs as Animate UI on web (Animate UI is DOM/SVG-only). Static imports keep the bundle tree-shakeable. */
const GLYPHS: Record<Glyph, Lucide.LucideIcon> = {
  bell: Lucide.Bell,
  clock: Lucide.Clock,
  wallet: Lucide.Wallet,
  'calendar-clock': Lucide.CalendarClock,
  user: Lucide.User,
  'circle-check': Lucide.CircleCheck,
  'bell-ring': Lucide.BellRing,
  ellipsis: Lucide.Ellipsis,
  'circle-x': Lucide.CircleX,
  'house-wifi': Lucide.HouseWifi,
  house: Lucide.House,
  'graduation-cap': Lucide.GraduationCap,
  gift: Lucide.Gift,
  users: Lucide.Users,
  'chart-column': Lucide.ChartColumn,
  settings: Lucide.Settings,
  'log-out': Lucide.LogOut,
  'sun-moon': Lucide.SunMoon,
};

/** One-shot, transform-only motions: they never change layout. */
function useMicroMotion(glyph: Glyph, play: boolean | number | undefined, reduce: boolean) {
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);
  useEffect(() => {
    if (!play || reduce) return;
    const t = (ms: number) => ({ duration: ms, easing: Easing.out(Easing.quad) });
    cancelAnimation(rotate); cancelAnimation(scale); cancelAnimation(shift);
    if (glyph === 'bell' || glyph === 'bell-ring') {
      rotate.value = withSequence(withTiming(14, t(90)), withTiming(-12, t(120)), withTiming(8, t(100)), withTiming(0, t(100)));
    } else if (glyph === 'sun-moon') {
      rotate.value = withTiming(rotate.value + 180, { duration: 420, easing: Easing.inOut(Easing.quad) });
    } else if (glyph === 'log-out') {
      shift.value = withSequence(withTiming(3, t(140)), withDelay(40, withTiming(0, t(160))));
    } else if (glyph === 'circle-check') {
      scale.value = withSequence(withTiming(1.14, t(140)), withTiming(1, t(160)));
    } else {
      scale.value = withSequence(withTiming(1.08, t(120)), withTiming(1, t(140)));
    }
  }, [play, reduce, glyph, rotate, scale, shift]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }, { rotate: `${rotate.value}deg` }, { scale: scale.value }] }));
}

/**
 * HR Connect's icon. Fixed box (size × size) so animation can never shift layout;
 * hidden from assistive tech unless a `label` is supplied.
 */
export function HRIcon({ name, size = 'md', color, tone, disabled, animate, label, style }: HRIconProps) {
  const reduce = useReducedMotion();
  const toneColor = useToneColor();
  const glyph = GLYPH_FOR[name];
  const Glyph = GLYPHS[glyph];
  const px = ICON_SIZE[size];
  const resolved = color ?? toneColor(tone ?? STATUS_TONE[name] ?? 'default');
  const motion = useMicroMotion(glyph, animate, reduce);
  const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };
  return (
    <View {...a11y} style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, style]}>
      <Animated.View style={[{ width: px, height: px }, motion]}>
        <Glyph size={px} color={resolved} strokeWidth={STROKE[size]} strokeLinecap="round" strokeLinejoin="round" />
      </Animated.View>
    </View>
  );
}
