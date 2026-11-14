import { GlassContainer, GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { triggerHaptic } from '@/hooks/useHaptics';
import { useGlass } from '@/hooks/useGlass';

const SIZE = 36;

/** Circular header control: interactive native Liquid Glass where available, a bordered translucent disc otherwise. 44pt hit area. */
export function GlassButton({ onPress, label, dark, children }: { onPress: () => void; label: string; dark: boolean; children: ReactNode }) {
  const { native, solid } = useGlass();
  const reduce = useReducedMotion();
  const disc = { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Pressable
      onPress={() => { triggerHaptic('impact-light'); onPress(); }}
      accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed && !reduce ? 0.92 : 1 }] })}>
      <View>
        {native
          ? <GlassView isInteractive glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} style={disc}>{children}</GlassView>
          : <View style={[disc, { borderWidth: 1,
              backgroundColor: solid ? (dark ? '#1B2B45' : '#FFFFFF') : dark ? 'rgba(148,170,210,0.14)' : 'rgba(255,255,255,0.55)',
              borderColor: dark ? 'rgba(190,205,235,0.22)' : 'rgba(203,213,225,0.85)' }]}>{children}</View>}
      </View>
    </Pressable>
  );
}

/** Groups neighbouring glass controls so the system can blend them as one material when they sit close together. */
export function GlassCluster({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  const { native } = useGlass();
  const row = { flexDirection: 'row', alignItems: 'center', gap } as const;
  return native ? <GlassContainer spacing={gap} style={row}>{children}</GlassContainer> : <View style={row}>{children}</View>;
}
