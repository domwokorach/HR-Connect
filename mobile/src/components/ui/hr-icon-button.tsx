import { useState, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { triggerHaptic } from '@/hooks/useHaptics';
import { useTheme } from '@/lib/theme';
import { HRIcon, CONTAINER_SIZE, type HRIconName, type HRIconSize, type HRIconTone } from './hr-icon';

export type HRIconButtonProps = {
  name: HRIconName;
  /** Required: an icon-only control has no other accessible name. */
  label: string;
  onPress?: () => void;
  size?: HRIconSize;
  tone?: HRIconTone;
  color?: string;
  disabled?: boolean;
  /** Translucent bordered surface for top-bar / floating controls. Leave off for ordinary in-content buttons. */
  glass?: boolean;
  /** Extra content layered over the icon, such as an unread badge. */
  badge?: ReactNode;
  /** Plays the icon animation on press (default) or whenever this value changes. */
  animate?: boolean | number;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 44pt hit target, controlled 0.92 press scale, light haptic and an icon micro-interaction. Nothing here changes layout. */
export function HRIconButton({ name, label, onPress, size = 'md', tone, color, disabled, glass, badge, animate, haptic = true, style }: HRIconButtonProps) {
  const reduce = useReducedMotion();
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const scale = useSharedValue(1);
  const [pulse, setPulse] = useState(0);
  const box = CONTAINER_SIZE[size];
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={() => { if (haptic) triggerHaptic('impact-light'); setPulse((n) => n + 1); onPress?.(); }}
      onPressIn={() => { if (!reduce) scale.value = withTiming(0.92, { duration: 90 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
      hitSlop={Math.max(0, (44 - box) / 2)}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={[{ width: Math.max(box, 44), height: Math.max(box, 44), alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={[{ width: box, height: box, borderRadius: box / 2, alignItems: 'center', justifyContent: 'center' },
        glass && { borderWidth: 1, backgroundColor: dark ? 'rgba(148,170,210,0.14)' : 'rgba(255,255,255,0.55)', borderColor: dark ? 'rgba(190,205,235,0.22)' : 'rgba(203,213,225,0.85)' }, press]}>
        <HRIcon name={name} size={size} tone={tone ?? 'muted'} color={color} disabled={disabled} animate={animate ?? pulse} />
        {badge}
      </Animated.View>
    </Pressable>
  );
}
