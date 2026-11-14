import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Rect, Text as SText } from 'react-native-svg';
import { T } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { textFamily } from '@/theme/typography';

export interface SankeyNode { id: string; label: string; column: number }
export interface SankeyLink { source: string; target: string; value: number }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Source-to-target flow diagram. Node height is proportional to the flow through it and each column is scaled with the
 * same unit, so link widths stay comparable. Column 0 labels sit in the left margin, the last column's in the right
 * margin, and middle labels beside their node. Tap a node to read its exact figures.
 */
export function SankeyChart({ nodes, links, unit = 'employees', rowHeight = 34 }: { nodes: SankeyNode[]; links: SankeyLink[]; unit?: string; rowHeight?: number }) {
  const { c } = useTheme();
  const [box, setBox] = useState(320);
  const [sel, setSel] = useState<string | null>(null);

  const layout = useMemo(() => {
    const cols = Math.max(...nodes.map((n) => n.column), 0) + 1;
    const flow = (id: string) => Math.max(links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0), links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0));
    const byCol = Array.from({ length: cols }, (_, k) => nodes.filter((n) => n.column === k).map((n) => ({ ...n, v: flow(n.id) })));
    const gap = 8;
    const tallest = Math.max(...byCol.map((col) => col.length), 1);
    const height = Math.max(180, tallest * rowHeight + 24);
    const inner = height - 16;
    const total = Math.max(...byCol.map((col) => col.reduce((s, n) => s + n.v, 0)), 1);
    const scale = (inner - gap * (tallest - 1)) / total;
    const pos = new Map<string, { x: number; y: number; h: number; v: number; column: number; label: string; outY: number; inY: number }>();
    byCol.forEach((col, k) => {
      const used = col.reduce((s, n) => s + n.v * scale, 0) + gap * (col.length - 1);
      let y = 8 + (inner - used) / 2; // each column is vertically centred
      col.forEach((n) => { const h = Math.max(n.v * scale, 2); pos.set(n.id, { x: k, y, h, v: n.v, column: k, label: n.label, outY: y, inY: y }); y += h + gap; });
    });
    return { cols, height, scale, pos };
  }, [nodes, links, rowHeight]);

  const side = Math.min(92, box * 0.28);
  const nodeW = 10;
  const x0 = side, x1 = box - side - nodeW;
  const xOf = (k: number) => (layout.cols <= 1 ? x0 : x0 + ((x1 - x0) * k) / (layout.cols - 1));
  const paths = useMemo(() => {
    const out: { key: string; d: string; w: number; source: string; target: string; value: number }[] = [];
    const pos = new Map([...layout.pos].map(([k, v]) => [k, { ...v }]));
    [...links].sort((a, b) => (pos.get(a.target)?.y ?? 0) - (pos.get(b.target)?.y ?? 0)).forEach((l) => {
      const s = pos.get(l.source), t = pos.get(l.target);
      if (!s || !t) return;
      const w = Math.max(l.value * layout.scale, 1);
      const sx = xOf(s.column) + nodeW, tx = xOf(t.column), sy = s.outY + w / 2, ty = t.inY + w / 2, mx = (sx + tx) / 2;
      s.outY += w; t.inY += w;
      out.push({ key: `${l.source}>${l.target}`, d: `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`, w, source: l.source, target: l.target, value: l.value });
    });
    return out;
  }, [links, layout, box]); // eslint-disable-line react-hooks/exhaustive-deps

  const selNode = sel ? layout.pos.get(sel) : null;
  const readout = selNode
    ? `${selNode.label}: ${selNode.v} ${unit}${paths.filter((p) => p.source === sel).length ? ' → ' + paths.filter((p) => p.source === sel).map((p) => `${layout.pos.get(p.target)?.label} ${p.value}`).join(', ') : ''}`
    : 'Tap a block to see where its flow goes';

  return (
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setBox(w); }} style={{ gap: 6 }}>
      <Svg width={box} height={layout.height} accessibilityLabel={`Flow diagram: ${links.map((l) => `${layout.pos.get(l.source)?.label} to ${layout.pos.get(l.target)?.label} ${l.value}`).join('; ')}`}>
        {paths.map((p, i) => {
          const active = !sel || sel === p.source || sel === p.target;
          return <Path key={p.key} d={p.d} stroke={c.chart[i % c.chart.length]} strokeWidth={p.w} strokeOpacity={active ? 0.35 : 0.1} fill="none" />;
        })}
        {[...layout.pos.entries()].map(([id, n]) => {
          const last = n.column === layout.cols - 1, first = n.column === 0;
          const x = xOf(n.column);
          const tx = first ? x - 6 : last ? x + nodeW + 6 : x + nodeW + 6;
          return (
            <G key={id} onPress={() => setSel(sel === id ? null : id)}>
              <Rect x={x} y={n.y} width={nodeW} height={n.h} rx={3} fill={c.chart[0]} opacity={!sel || sel === id ? 1 : 0.5} />
              <SText fontFamily={textFamily()} x={tx} y={n.y + n.h / 2 + 4} fontSize={11} fill={c.text} textAnchor={first ? 'end' : 'start'} stroke={c.surface} strokeWidth={first || last ? 0 : 3} strokeLinejoin="round">
                {clip(`${n.label} ${n.v}`, first || last ? Math.floor(side / 6.2) : 16)}
              </SText>
            </G>
          );
        })}
      </Svg>
      <T v="small" muted style={{ minHeight: 17, textAlign: 'center' }}>{readout}</T>
    </View>
  );
}
