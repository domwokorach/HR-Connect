import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { Legend } from '@/components/charts';
import { T } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { textFamily } from '@/theme/typography';

const niceMax = (m: number) => {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ComposedSeries { name: string; values: number[]; unit: string; color?: string }

/**
 * Bars on the left axis, a line on the right axis. The two series have different units, so each axis carries its
 * own unit label and the chart never shares one unlabeled scale. Optional `target` draws a dashed reference line on the bar axis.
 */
export function ComposedChart({ labels, bars, line, target, height = 230 }: {
  labels: string[]; bars: ComposedSeries; line: ComposedSeries; target?: { name: string; value: number }; height?: number;
}) {
  const { c } = useTheme();
  const [box, setBox] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const barColor = bars.color ?? c.chart[0];
  const lineColor = line.color ?? c.chart[2];
  const barMax = niceMax(Math.max(...bars.values, target?.value ?? 0, 0));
  const lineMax = niceMax(Math.max(...line.values, 0));
  // Equal margins either side keep the plot centred; each holds one axis' labels and unit.
  const side = 44;
  const m = { left: side, right: side, top: 22, bottom: 24 };
  const plotW = Math.max(box - m.left - m.right, 1);
  const plotH = height - m.top - m.bottom;
  const slot = plotW / Math.max(labels.length, 1);
  const barW = Math.min(slot * 0.55, 36);
  const cx = (i: number) => m.left + slot * i + slot / 2;
  const yBar = (v: number) => m.top + plotH - (v / barMax) * plotH;
  const yLine = (v: number) => m.top + plotH - (v / lineMax) * plotH;
  const path = line.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${yLine(v)}`).join(' ');
  const ticks = 4;

  return (
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setBox(w); }} style={{ gap: 6 }}>
      <Pressable onPress={(e) => { const i = Math.floor((e.nativeEvent.locationX - m.left) / slot); if (i >= 0 && i < labels.length) setSel(i); }}>
        <Svg width={box} height={height} accessibilityLabel={`${bars.name} and ${line.name} by ${labels.join(', ')}`}>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const y = m.top + plotH - (plotH * i) / ticks;
            return (
              <G key={i}>
                <Line x1={m.left} x2={box - m.right} y1={y} y2={y} stroke={c.border} strokeWidth={1} />
                <SText fontFamily={textFamily()} x={m.left - 6} y={y + 4} fontSize={11} fill={c.muted} textAnchor="end">{r1((barMax * i) / ticks)}</SText>
                <SText fontFamily={textFamily()} x={box - m.right + 6} y={y + 4} fontSize={11} fill={c.muted} textAnchor="start">{r1((lineMax * i) / ticks)}</SText>
              </G>
            );
          })}
          <SText fontFamily={textFamily()} x={m.left - 6} y={12} fontSize={11} fill={barColor} textAnchor="end" fontWeight="600">{bars.unit}</SText>
          <SText fontFamily={textFamily()} x={box - m.right + 6} y={12} fontSize={11} fill={lineColor} textAnchor="start" fontWeight="600">{line.unit}</SText>
          {labels.map((lb, i) => (
            <G key={lb + i}>
              <Rect x={cx(i) - barW / 2} y={yBar(bars.values[i] ?? 0)} width={barW} height={Math.max(((bars.values[i] ?? 0) / barMax) * plotH, (bars.values[i] ?? 0) > 0 ? 1 : 0)} rx={4} fill={barColor} opacity={sel !== null && sel !== i ? 0.45 : 1} />
              <SText fontFamily={textFamily()} x={cx(i)} y={height - 6} fontSize={11} fill={c.muted} textAnchor="middle">{lb.length > 8 ? lb.slice(0, 7) + '…' : lb}</SText>
            </G>
          ))}
          {target ? <Line x1={m.left} x2={box - m.right} y1={yBar(target.value)} y2={yBar(target.value)} stroke={c.muted} strokeWidth={1.5} strokeDasharray="5,4" /> : null}
          <Path d={path} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {line.values.map((v, i) => <Circle key={i} cx={cx(i)} cy={yLine(v)} r={sel === i ? 5 : 3.5} fill={c.surface} stroke={lineColor} strokeWidth={2} />)}
        </Svg>
      </Pressable>
      <T v="small" muted style={{ minHeight: 17, textAlign: 'center' }}>
        {sel !== null ? `${labels[sel]}: ${bars.name} ${r1(bars.values[sel] ?? 0)}${bars.unit} · ${line.name} ${r1(line.values[sel] ?? 0)}${line.unit}` : 'Tap a day for details'}
      </T>
      <Legend items={[{ name: `${bars.name} (${bars.unit}, left axis)`, color: barColor }, { name: `${line.name} (${line.unit}, right axis)`, color: lineColor }, ...(target ? [{ name: target.name, color: c.muted }] : [])]} />
    </View>
  );
}
