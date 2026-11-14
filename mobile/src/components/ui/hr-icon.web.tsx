import { useReducedMotion } from 'motion/react';
import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import type { IconProps } from '@animate-ui/react/icons';
import { BellIcon } from '@/components/animate-ui/icons/bell.web';
import { BellRingIcon } from '@/components/animate-ui/icons/bell-ring.web';
import { CalendarClockIcon } from '@/components/animate-ui/icons/calendar-clock.web';
import { ChartColumnIcon } from '@/components/animate-ui/icons/chart-column.web';
import { CircleCheckIcon } from '@/components/animate-ui/icons/circle-check.web';
import { CircleXIcon } from '@/components/animate-ui/icons/circle-x.web';
import { ClockIcon } from '@/components/animate-ui/icons/clock.web';
import { EllipsisIcon } from '@/components/animate-ui/icons/ellipsis.web';
import { GiftIcon } from '@/components/animate-ui/icons/gift.web';
import { GraduationCapIcon } from '@/components/animate-ui/icons/graduation-cap.web';
import { HouseIcon } from '@/components/animate-ui/icons/house.web';
import { HouseWifiIcon } from '@/components/animate-ui/icons/house-wifi.web';
import { LogOutIcon } from '@/components/animate-ui/icons/log-out.web';
import { SettingsIcon } from '@/components/animate-ui/icons/settings.web';
import { SunMoonIcon } from '@/components/animate-ui/icons/sun-moon.web';
import { UserIcon } from '@/components/animate-ui/icons/user.web';
import { UsersIcon } from '@/components/animate-ui/icons/users.web';
import { WalletIcon } from '@/components/animate-ui/icons/wallet.web';
import { GLYPH_FOR, ICON_SIZE, STATUS_TONE, STROKE, type Glyph } from './hr-icon-map';
import { useToneColor, type HRIconProps } from './hr-icon.shared';

export { GLYPH_FOR, ICON_SIZE, CONTAINER_SIZE, type HRIconName, type HRIconSize, type HRIconTone } from './hr-icon-map';
export { useToneColor, type HRIconProps } from './hr-icon.shared';

const GLYPHS: Record<Glyph, ComponentType<IconProps<never>>> = {
  bell: BellIcon,
  clock: ClockIcon,
  wallet: WalletIcon,
  'calendar-clock': CalendarClockIcon,
  user: UserIcon,
  'circle-check': CircleCheckIcon,
  'bell-ring': BellRingIcon,
  ellipsis: EllipsisIcon,
  'circle-x': CircleXIcon,
  'house-wifi': HouseWifiIcon,
  house: HouseIcon,
  'graduation-cap': GraduationCapIcon,
  gift: GiftIcon,
  users: UsersIcon,
  'chart-column': ChartColumnIcon,
  settings: SettingsIcon,
  'log-out': LogOutIcon,
  'sun-moon': SunMoonIcon,
};

/** Web: the Animate UI icon. Hover/focus and `animate` play the one-shot animation; reduced motion disables both. */
export function HRIcon({ name, size = 'md', color, tone, disabled, animate, label, style }: HRIconProps) {
  const reduce = useReducedMotion();
  // A boolean holds the animation while true; a number replays it on every change.
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (typeof animate !== 'number' || !animate) return;
    setBurst(true);
    const id = setTimeout(() => setBurst(false), 700);
    return () => clearTimeout(id);
  }, [animate]);
  const playing = typeof animate === 'number' ? burst : !!animate;
  const toneColor = useToneColor();
  const Glyph = GLYPHS[GLYPH_FOR[name]];
  const px = ICON_SIZE[size];
  const resolved = color ?? toneColor(tone ?? STATUS_TONE[name] ?? 'default');
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  return (
    <View style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, style]}>
      <Glyph
        size={px}
        strokeWidth={STROKE[size]}
        style={{ color: resolved, display: 'block' }}
        animate={reduce ? undefined : playing}
        animateOnHover={!reduce && !disabled}
        {...a11y}
      />
    </View>
  );
}
