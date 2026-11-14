import { BarChart3, CalendarClock, Mail, ShieldCheck } from 'lucide-react-native';

export type FeatureIconName = 'users' | 'time' | 'insight' | 'security';

const ICONS = { users: Mail, time: CalendarClock, insight: BarChart3, security: ShieldCheck } as const;

/** Native fallback: Animate UI is web-only, so native renders the static Lucide glyph. */
export function FeatureIcon({ name, size = 22, color }: { name: FeatureIconName; size?: number; color: string; animate?: boolean }) {
  const Icon = ICONS[name];
  return <Icon size={size} color={color} />;
}
