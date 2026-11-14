import { CalendarClockIcon } from '@/components/animate-ui/icons/calendar-clock.web';
import { ChartColumnIcon } from '@/components/animate-ui/icons/chart-column.web';
import { MailIcon } from '@/components/animate-ui/icons/mail.web';
import { ShieldCheckIcon } from '@/components/animate-ui/icons/shield-check.web';
import type { FeatureIconName } from './FeatureIcon';

const ICONS = { users: MailIcon, time: CalendarClockIcon, insight: ChartColumnIcon, security: ShieldCheckIcon } as const;

/** Animate UI icon (web). `animate` plays the icon's animation, driven by the row's hover state. */
export function FeatureIcon({ name, size = 22, color, animate }: { name: FeatureIconName; size?: number; color: string; animate?: boolean }) {
  const Icon = ICONS[name];
  return <Icon size={size} strokeWidth={1.75} animate={animate} style={{ color }} />;
}
