import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import type { HRIconName, HRIconSize, HRIconTone } from './hr-icon-map';

export type HRIconProps = {
  name: HRIconName;
  size?: HRIconSize;
  /** Overrides the tone-derived colour (e.g. an active/inactive tab tint). */
  color?: string;
  tone?: HRIconTone;
  disabled?: boolean;
  /** Plays the icon's one-shot micro-interaction each time this flips to true (or the number changes). */
  animate?: boolean | number;
  /** Provide only when the icon is the sole content of a control; otherwise it is hidden from screen readers. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function useToneColor() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  return (tone: HRIconTone): string => {
    switch (tone) {
      case 'muted': return dark ? '#94A3B8' : '#64748B';
      case 'success': return c.success;
      case 'warning': return c.warning;
      case 'danger': return c.danger;
      case 'info': return c.info;
      case 'accent': return c.accent;
      case 'inverse': return '#F1F5F9';
      default: return dark ? '#E2E8F0' : '#0B1730';
    }
  };
}
