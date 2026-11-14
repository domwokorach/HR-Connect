import type { LucideProps } from 'lucide-react-native';
import { useReducedMotion } from 'motion/react';
import type { ComponentType } from 'react';
import { LockKeyholeIcon } from '@/components/animate-ui/icons/hugeicons-lock-keyhole.web';
import { ShieldCheckIcon } from '@/components/animate-ui/icons/hugeicons-shield-check.web';
import { ViewIcon } from '@/components/animate-ui/icons/hugeicons-view.web';

/** Adapts an Animate UI Hugeicon to the Lucide-style props (size, color, strokeWidth) our Input/Button pass to icons. Plays on hover unless the user prefers reduced motion. */
function adapt(Icon: ComponentType<Record<string, unknown>>): ComponentType<LucideProps> {
  return function FormIcon({ size = 18, color, strokeWidth }: LucideProps) {
    const reduce = useReducedMotion();
    return <Icon size={size} strokeWidth={strokeWidth} animateOnHover={!reduce} style={{ color }} />;
  };
}

export const ViewAnimated = adapt(ViewIcon as never);
export const LockKeyholeAnimated = adapt(LockKeyholeIcon as never);
export const ShieldCheckAnimated = adapt(ShieldCheckIcon as never);
