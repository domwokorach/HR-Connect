import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Text as SText } from 'react-native-svg';
import { T } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { textFamily } from '@/theme/typography';

export interface RadialRing { label: string; percent: number; detail: string; color: string }

/**
 * Concentric progress rings with one large value in the centre. Rings share one stroke width, start at 12 o'clock and
 * have rounded ends. The chart is a square sized from the parent width (capped), centred horizontally; the ring
 * table underneath repeats every value as text so colour is never the only identifier.
 */
export function AttendanceRadialChart({ rings, centerValue, centerLabel, maxSize = 220, stroke = 14 }: {
  rings: RadialRing[]; centerValue: string; centerLabel: string; maxSize?: number; stroke?: number;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(maxSize);
  const size = Math.max(Math.min(w, maxSize), 120);
  const gap = 5;
  const half = size / 2;
  const outer = half - stroke / 2 - 1;

  return (
    <View onLayout={(e) => { const lw = e.nativeEvent.layout.width; if (lw > 0) setW(lw); }} style={{ width: '100%', alignItems: 'center', gap: 14 }}>
      <Svg width={size} height={size} accessibilityLabel={`${centerLabel} ${centerValue}. ${rings.map((r) => `${r.label} ${r.percent} percent`).join(', ')}`}>
        {rings.map((r, i) => {
          const rad = outer - i * (stroke + gap);
          if (rad <= stroke) return null;
          const circ = 2 * Math.PI * rad;
          const p = Math.max(0, Math.min(100, r.percent)) / 100;
          return (
            <G key={r.label}>
              <Circle cx={half} cy={half} r={rad} stroke={c.border} strokeWidth={stroke} fill="none" />
              {p > 0 ? <Circle cx={half} cy={half} r={rad} stroke={r.color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ * p} ${circ}`} transform={`rotate(-90 ${half} ${half})`} /> : null}
            </G>
          );
        })}
        <SText fontFamily={textFamily('600')} x={half} y={half + 2} fontSize={Math.round(size * 0.17)} fontWeight="600" fill={c.text} textAnchor="middle">{centerValue}</SText>
        <SText fontFamily={textFamily()} x={half} y={half + 2 + Math.round(size * 0.09)} fontSize={11} fill={c.muted} textAnchor="middle">{centerLabel}</SText>
      </Svg>
      <View style={{ width: '100%', gap: 6 }}>
        {rings.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} />
            <T v="small" style={{ flex: 1 }}>{r.label}</T>
            <T v="small" muted>{r.detail}</T>
            <T v="small" style={{ minWidth: 40, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{r.percent}%</T>
          </View>
        ))}
      </View>
    </View>
  );
}
