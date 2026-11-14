import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card, Row, T, useBreakpoint } from '@/components/ui';

/** Card wrapper for a chart: title, optional controls, and a plain-text summary that screen readers (and everyone else) can use. */
export function ChartCard({ title, description, summary, right, children, minHeight }: {
  title: string; description?: string; summary?: string; right?: ReactNode; children: ReactNode; minHeight?: number;
}) {
  const { isMobile } = useBreakpoint();
  const ta = isMobile ? ({ textAlign: 'center' } as const) : undefined;
  return (
    <Card style={{ gap: 12, minHeight }}>
      <Row style={{ justifyContent: isMobile ? 'center' : 'space-between', alignItems: 'flex-start' }} wrap>
        <View style={{ flexShrink: 1, maxWidth: '100%', alignItems: isMobile ? 'center' : 'stretch' }}>
          <T v="h3" accessibilityRole="header" style={ta}>{title}</T>
          {description ? <T v="small" muted style={ta}>{description}</T> : null}
        </View>
        {right}
      </Row>
      <View accessible accessibilityLabel={`${title}. ${summary ?? ''}`} style={{ width: '100%', alignItems: 'stretch', gap: 8 }}>{children}</View>
      {summary ? <T v="small" muted style={ta}>{summary}</T> : null}
    </Card>
  );
}
