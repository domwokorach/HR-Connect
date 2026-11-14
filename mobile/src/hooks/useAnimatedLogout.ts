import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const EXIT_MS = 260;

/** Plays the log-out icon's exit motion, then runs the existing sign-out. Immediate under reduced motion. */
export function useAnimatedLogout(signOut: () => void | Promise<void>) {
  const reduce = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const logout = useCallback(() => {
    if (reduce) { void signOut(); return; }
    setExiting(true);
    timer.current = setTimeout(() => { void signOut(); }, EXIT_MS);
  }, [reduce, signOut]);
  return { exiting, logout };
}
