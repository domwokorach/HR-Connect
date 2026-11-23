import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Logo } from './Logo';
import { BRAND } from './logo-geometry';

const FADE_IN = 1000;
const HOLD = 3000;
const FADE_OUT = 1000; // 5 s in total

let shown = false; // once per app launch, not on every route change

/** Full-screen brand splash: white surface, logo fades in with a gentle zoom, holds, then fades out and reveals the app. */
export function AnimatedSplash() {
  const [visible, setVisible] = useState(!shown);
  const reduce = useReducedMotion();
  const logoOpacity = useSharedValue(0);
  const surfaceOpacity = useSharedValue(1);
  const scale = useSharedValue(reduce ? 1 : 0.94);

  useEffect(() => {
    if (shown) return;
    shown = true;
    const ease = Easing.inOut(Easing.cubic);
    const done = () => setVisible(false);
    const failsafe = setTimeout(done, FADE_IN + HOLD + FADE_OUT + 1000); // the worklet callback can fail to fire on web; never leave the overlay up
    logoOpacity.value = withTiming(1, { duration: FADE_IN, easing: ease });
    scale.value = withTiming(1, { duration: FADE_IN + HOLD + FADE_OUT, easing: Easing.out(Easing.quad) });
    // the whole surface (logo included) fades away in the last second, revealing the app underneath
    surfaceOpacity.value = withDelay(FADE_IN + HOLD, withTiming(0, { duration: FADE_OUT, easing: ease }, (finished) => { if (finished) runOnJS(done)(); }));
    return () => clearTimeout(failsafe);
  }, [logoOpacity, surfaceOpacity, scale]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ scale: scale.value }] }));
  const surfaceStyle = useAnimatedStyle(() => ({ opacity: surfaceOpacity.value }));
  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.surface, surfaceStyle]} accessibilityLabel="HR Connect" accessibilityRole="image">
      <Animated.View style={[styles.logo, logoStyle]}><Logo variant="onLight" maxWidth={300} /></Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  logo: { width: '70%', maxWidth: 300, alignItems: 'center' },
});
