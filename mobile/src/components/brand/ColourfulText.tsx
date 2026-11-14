/**
 * ColourfulText — animated per-letter colour emphasis.
 *
 * Adapted from Aceternity UI "Colourful Text" (Manu Arora). The web original relies on framer-motion, Tailwind and
 * CSS blur, none of which exist in React Native, so the behaviour is re-implemented on Reanimated (iOS, Android, web):
 *   - every letter is its own animated element, staggered by `stagger` ms
 *   - on each cycle the colours rotate along the palette with a smooth, eased colour transition
 *   - a 2px lift and a slight opacity dip give emphasis without flashing (the original's blur pulse is intentionally dropped)
 * Reduced motion: if the OS asks for it, letters stay static in a fixed palette order — no cycling, no movement.
 * Accessibility: the phrase is exposed once to assistive tech (aria-label on the wrapper); individual letters are hidden.
 */
import { useEffect, useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppFont } from '@/lib/fonts';

/** Navy blue, royal blue, muted cyan, subtle indigo — tuned for ≥ 4.5:1 contrast on the surface they are used on. */
export const COLOURFUL_PALETTES = {
  onDark: ['#8FB0E0', '#7AAAF0', '#6CC4D0', '#A3AFF0'],   // on Deep Navy #0B1830 (contrast 7–10:1)
  onLight: ['#142B49', '#2B5FB8', '#1F7F8E', '#4B55B8'],  // on #F6F8FB / white (contrast 5–14:1)
} as const;

interface CharProps {
  ch: string; index: number; colors: readonly string[]; cycle: number; animate: boolean; stagger: number; duration: number; style: TextStyle;
}

function Char({ ch, index, colors, cycle, animate, stagger, duration, style }: CharProps) {
  const n = colors.length;
  const from = colors[(((index + cycle - 1) % n) + n) % n];
  const to = colors[(index + cycle) % n];
  const t = useSharedValue(1);

  useEffect(() => {
    if (!animate || cycle === 0) { t.value = 1; return; }
    t.value = 0;
    t.value = withDelay(index * stagger, withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }));
  }, [cycle, animate, index, stagger, duration, t]);

  const anim = useAnimatedStyle(() => ({
    color: interpolateColor(t.value, [0, 1], [from, to]),
    opacity: interpolate(t.value, [0, 0.5, 1], [1, 0.88, 1]),
    transform: [{ translateY: interpolate(t.value, [0, 0.5, 1], [0, -2, 0]) }],
  }));

  return <Animated.Text style={animate ? [style, anim] : [style, { color: to }]}>{ch}</Animated.Text>;
}

export function ColourfulText({ text, colors = COLOURFUL_PALETTES.onDark, interval = 6000, stagger = 55, duration = 900, style }: {
  text: string; colors?: readonly string[]; interval?: number; stagger?: number; duration?: number; style: TextStyle;
}) {
  const reduce = useReducedMotion();
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setCycle((c) => c + 1), interval);
    return () => clearInterval(id);
  }, [reduce, interval]);

  // Letters are grouped by word so a long phrase can still wrap between words.
  const words = text.split(' ');
  let i = 0;
  return (
    <View aria-hidden style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((w, wi) => (
        <View key={`${w}-${wi}`} style={{ flexDirection: 'row' }}>
          {w.split('').map((ch) => <Char key={i} ch={ch} index={i++} colors={colors} cycle={cycle} animate={!reduce} stagger={stagger} duration={duration} style={style} />)}
          {wi < words.length - 1 ? <Text style={style}> </Text> : null}
        </View>
      ))}
    </View>
  );
}

/** The sign-in headline: static words + an animated "people operations." */
export function BrandHeadline({ tone = 'onDark', size = 38 }: { tone?: 'onDark' | 'onLight'; size?: number }) {
  const bold = useAppFont('700');
  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.22), letterSpacing: -size * 0.02, color: tone === 'onDark' ? '#FFFFFF' : '#17263C', ...bold };
  const phrase = 'The calm, clear way to run your people operations.';
  return (
    <View accessibilityRole="header" aria-level={1} aria-label={phrase} accessible style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {'The calm, clear way to run your'.split(' ').map((w, k) => <Text key={k} aria-hidden style={base}>{w}{' '}</Text>)}
      <ColourfulText text="people operations." colors={COLOURFUL_PALETTES[tone]} style={base} />
    </View>
  );
}
