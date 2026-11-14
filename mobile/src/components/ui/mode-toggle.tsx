import { Button, ButtonSize, ButtonVariant } from '@/components/ui/button';
import { HRIcon } from '@/components/ui/hr-icon';
import { useModeToggle } from '@/hooks/useModeToggle';
import { useEffect, useRef, useState } from 'react';

type Props = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  haptic?: boolean;
};

export const ModeToggle = ({
  variant = 'outline',
  size = 'icon',
  haptic = true,
}: Props) => {
  const { toggleMode, isDark } = useModeToggle();
  // Counts theme changes (not the initial render) so Sun Moon plays only when the theme actually switches.
  const [changes, setChanges] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setChanges((n) => n + 1);
  }, [isDark]);

  return (
    <Button
      variant={variant}
      size={size}
      onPress={toggleMode}
      haptic={haptic}
      accessibilityRole='button'
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <HRIcon name='appearance' size='lg' animate={changes} />
    </Button>
  );
};
