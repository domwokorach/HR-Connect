import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Native Liquid Glass needs iOS 26+ *and* the glass API: some iOS 26 betas report the former without the latter and crash. */
export function nativeGlassSupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
}

/**
 * Glass capabilities for the current device and the user's accessibility settings.
 * `native`: render real `GlassView`. Otherwise `solid` says whether Reduce Transparency forbids even a blurred surface.
 */
export function useGlass() {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    // react-native-web's AccessibilityInfo has no Reduce Transparency API (only iOS does), so guard each call.
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled !== 'function') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => { if (alive) setReduceTransparency(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  // The system already softens native glass under Reduce Transparency, so only the hand-built fallback needs to go solid.
  return { native: nativeGlassSupported(), solid: reduceTransparency };
}
