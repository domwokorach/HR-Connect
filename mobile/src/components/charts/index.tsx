import { useState } from 'react';
import { textFamily } from '@/theme/typography';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { T } from '@/components/ui';
import { useTheme } from '@/lib/theme';

// Dependency-light SVG charts (react-native-svg ships with Expo Go). All charts are tappable: a tap selects
// a datum and shows its exact value below the chart, which also works on touch screens where hover doesn't.

export interface Datum { label: string; value: number; color?: string }
export interface Series { name: string; color?: string; values: number[] }

/** Whole-number data (headcounts, days) gets whole-number axis ticks. */
const wholeAxis = (values: number[], unit: string) => !unit && values.every((v) => Number.isInteger(v));
const niceMax = (m: number) => {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

function Readout({ text }: { text: string | null }) {
  return <T v="small" muted style={{ minHeight: 17, textAlign: 'center' }}>{text ?? 'Tap a bar or point for details'}</T>;
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
      {items.map((i) => (
        <View key={i.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i.color }} />
          <T v="small" muted>{i.name}</T>
        </View>
      ))}
    </View>
  );
}

interface AxisProps { width: number; height: number; max: number; ticks?: number; left: number; bottom: number; top: number; right: number; fmt: (n: number) => string }
function Grid({ width, height, max, ticks = 4, left, bottom, top, right, fmt }: AxisProps) {
  const { c } = useTheme();
  const h = height - top - bottom;
  return (
    <G>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const y = top + h - (h * i) / ticks;
        return (
          <G key={i}>
            <Line x1={left} x2={width - right} y1={y} y2={y} stroke={c.border} strokeWidth={1} />
            <SText fontFamily={textFamily()} x={left - 6} y={y + 4} fontSize={11} fill={c.muted} textAnchor="end" fontWeight="400">{fmt((max * i) / ticks)}</SText>
          </G>
        );
      })}
    </G>
  );
}

/** Grouped or stacked vertical bar chart. */
export function BarChart({ labels, series, height = 220, stacked, unit = '', format, width: w = 320 }: {
  labels: string[]; series: Series[]; height?: number; stacked?: boolean; unit?: string; format?: (n: number) => string; width?: number;
}) {
  const { c } = useTheme();
  const [sel, setSel] = useState<{ i: number } | null>(null);
  const [box, setBox] = useState(w);
  const fmt = format ?? ((n: number) => `${Math.round(n * 10) / 10}${unit}`);
  const colors = series.map((s, i) => s.color ?? c.chart[i % c.chart.length]);
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0))));
  const whole = wholeAxis(series.flatMap((x) => x.values), unit);
  const rawMax = Math.max(...totals, 0);
  const max = whole && rawMax <= 8 ? Math.max(1, Math.ceil(rawMax)) : niceMax(rawMax);
  const ticks = whole && max <= 8 ? max : 4;
  // Equal margins either side: the y-labels live in the left one, so the plot itself sits centred in the card.
  const side = Math.max(38, 14 + fmt(max).length * 6.8);
  const m = { left: side, right: side, top: 10, bottom: 24 };
  const plotW = Math.max(box - m.left - m.right, 1);
  const plotH = height - m.top - m.bottom;
  const slot = plotW / Math.max(labels.length, 1);
  const barW = stacked ? Math.min(slot * 0.6, 44) : Math.min((slot * 0.7) / series.length, 30);

  return (
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setBox(w); }} style={{ gap: 6 }}>
      <Pressable onPress={(e) => { const i = Math.floor((e.nativeEvent.locationX - m.left) / slot); if (i >= 0 && i < labels.length) setSel({ i }); }}>
      <Svg width={box} height={height} accessibilityLabel={`Bar chart: ${labels.join(', ')}`}>
        <Grid width={box} height={height} max={max} ticks={ticks} {...m} fmt={fmt} />
        {labels.map((lb, i) => {
          const cx = m.left + slot * i + slot / 2;
          let acc = 0;
          return (
            <G key={lb + i}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const bh = (v / max) * plotH;
                const x = stacked ? cx - barW / 2 : cx - (barW * series.length) / 2 + si * barW;
                const y = stacked ? m.top + plotH - ((acc + v) / max) * plotH : m.top + plotH - bh;
                acc += v;
                return <Rect key={si} x={x} y={y} width={Math.max(barW - 2, 1)} height={Math.max(bh, v > 0 ? 1 : 0)} rx={3} fill={colors[si]} opacity={sel && sel.i !== i ? 0.45 : 1} />;
              })}
              <SText fontFamily={textFamily()} x={cx} y={height - 6} fontSize={11} fill={c.muted} textAnchor="middle" fontWeight="400">{lb.length > 8 ? lb.slice(0, 7) + '…' : lb}</SText>
            </G>
          );
        })}
      </Svg>
      </Pressable>
      <Readout text={sel ? `${labels[sel.i]}: ${series.map((s) => `${series.length > 1 ? s.name + ' ' : ''}${fmt(s.values[sel.i] ?? 0)}`).join(' · ')}` : null} />
      {series.length > 1 ? <Legend items={series.map((s, i) => ({ name: s.name, color: colors[i] }))} /> : null}
    </View>
  );
}

/** Multi-series line chart. */
export function LineChart({ labels, series, height = 200, unit = '', format }: {
  labels: string[]; series: Series[]; height?: number; unit?: string; format?: (n: number) => string;
}) {
  const { c } = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const [box, setBox] = useState(320);
  const fmt = format ?? ((n: number) => `${Math.round(n * 10) / 10}${unit}`);
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const m = { left: Math.max(38, 14 + fmt(max).length * 6.8), right: 18, top: 10, bottom: 24 };
  const plotW = Math.max(box - m.left - m.right, 1);
  const plotH = height - m.top - m.bottom;
  const xAt = (i: number) => m.left + (labels.length <= 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
  const yAt = (v: number) => m.top + plotH - (v / max) * plotH;
  const step = Math.ceil(labels.length / 7);

  return (
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setBox(w); }} style={{ gap: 6 }}>
      <Pressable onPress={(e) => { const x = e.nativeEvent.locationX; let best = 0; for (let i = 1; i < labels.length; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i; if (labels.length) setSel(best); }}>
      <Svg width={box} height={height} accessibilityLabel={`Line chart: ${series.map((s) => s.name).join(', ')}`}>
        <Grid width={box} height={height} max={max} {...m} fmt={fmt} />
        {sel !== null ? <Line x1={xAt(sel)} x2={xAt(sel)} y1={m.top} y2={m.top + plotH} stroke={c.muted} strokeDasharray="3,3" /> : null}
        {series.map((s, si) => {
          const col = s.color ?? c.chart[si % c.chart.length];
          const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(v)}`).join(' ');
          return (
            <G key={si}>
              <Path d={d} stroke={col} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <Circle key={i} cx={xAt(i)} cy={yAt(v)} r={sel === i ? 5 : 3} fill={col} />)}
            </G>
          );
        })}
        {labels.map((lb, i) => (
          <G key={i}>
            {i % step === 0 ? <SText fontFamily={textFamily()} x={xAt(i)} y={height - 6} fontSize={11} fill={c.muted} textAnchor="middle" fontWeight="400">{lb}</SText> : null}
          </G>
        ))}
      </Svg>
      </Pressable>
      <Readout text={sel !== null ? `${labels[sel]}: ${series.map((s) => `${series.length > 1 ? s.name + ' ' : ''}${fmt(s.values[sel] ?? 0)}`).join(' · ')}` : null} />
      {series.length > 1 ? <Legend items={series.map((s, i) => ({ name: s.name, color: s.color ?? c.chart[i % c.chart.length] }))} /> : null}
    </View>
  );
}

/** Donut / pie chart with a tappable legend. */
export function PieChart({ data, size = 180, donut = true, format }: { data: Datum[]; size?: number; donut?: boolean; format?: (n: number) => string }) {
  const { c } = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const fmt = format ?? ((n: number) => String(Math.round(n * 10) / 10));
  const r = size / 2 - 4;
  const cx = size / 2;
  const colors = data.map((d, i) => d.color ?? c.chart[i % c.chart.length]);
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const frac = total === 0 ? 0 : d.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)},${cx + rad * Math.sin(a)}`;
    const inner = donut ? r * 0.6 : 0;
    const full = frac >= 0.9999;
    const path = full
      ? `M${p(0, r)} A${r},${r} 0 1 1 ${p(Math.PI, r)} A${r},${r} 0 1 1 ${p(0, r)}${donut ? ` M${p(0, inner)} A${inner},${inner} 0 1 0 ${p(Math.PI, inner)} A${inner},${inner} 0 1 0 ${p(0, inner)}` : ''}`
      : `M${p(a0, r)} A${r},${r} 0 ${big} 1 ${p(a1, r)} ${donut ? `L${p(a1, inner)} A${inner},${inner} 0 ${big} 0 ${p(a0, inner)}` : `L${cx},${cx}`} Z`;
    return { path, i, frac };
  });

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Pressable onPress={(e) => {
        if (total === 0) return;
        const dx = e.nativeEvent.locationX - cx, dy = e.nativeEvent.locationY - cx;
        let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
        let acc = 0;
        for (let i = 0; i < data.length; i++) { acc += (data[i].value / total) * Math.PI * 2; if (a <= acc) { setSel(i); return; } }
      }}>
      <Svg width={size} height={size} accessibilityLabel={`Pie chart: ${data.map((d) => d.label).join(', ')}`}>
        {total === 0 ? <Circle cx={cx} cy={cx} r={r} fill={c.surfaceAlt} /> : slices.map((s) => (
          <Path key={s.i} d={s.path} fill={colors[s.i]} fillRule="evenodd" opacity={sel !== null && sel !== s.i ? 0.4 : 1} stroke={c.surface} strokeWidth={2} />
        ))}
        {donut ? (
          <>
            <SText fontFamily={textFamily()} x={cx} y={cx - 2} textAnchor="middle" fontSize={22} fontWeight="800" fill={c.text}>{sel !== null ? fmt(data[sel].value) : fmt(total)}</SText>
            <SText fontFamily={textFamily()} x={cx} y={cx + 16} textAnchor="middle" fontSize={11} fill={c.muted} fontWeight="400">{sel !== null ? data[sel].label : 'Total'}</SText>
          </>
        ) : null}
      </Svg>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {data.map((d, i) => (
          <Pressable key={d.label} onPress={() => setSel(sel === i ? null : i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors[i] }} />
            <T v="small" muted>{d.label} · {fmt(d.value)}{total ? ` (${Math.round((d.value / total) * 100)}%)` : ''}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars — good for long labels (departments, courses) and funnels. */
export function HBarChart({ data, format, max: maxProp }: { data: Datum[]; format?: (n: number) => string; max?: number }) {
  const { c } = useTheme();
  const max = maxProp ?? Math.max(...data.map((d) => d.value), 1);
  const fmt = format ?? ((n: number) => String(Math.round(n * 10) / 10));
  return (
    <View style={{ gap: 10 }}>
      {data.map((d, i) => (
        <View key={d.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="small">{d.label}</T><T v="small" muted>{fmt(d.value)}</T>
          </View>
          <View style={{ height: 10, backgroundColor: c.surfaceAlt, borderRadius: 6, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (d.value / max) * 100)}%`, height: '100%', backgroundColor: d.color ?? c.chart[i % c.chart.length], borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
