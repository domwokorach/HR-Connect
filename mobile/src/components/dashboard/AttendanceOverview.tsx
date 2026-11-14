import { View } from 'react-native';
import { AttendanceRadialChart } from '@/components/charts/attendance-radial-chart';
import { Card, Divider, T, useBreakpoint } from '@/components/ui';
import { pct } from '@/lib/calc';
import { useTheme } from '@/lib/theme';

export interface AttendanceOverviewProps {
  total: number; present: number; absent: number; late: number | null; remote: number; inOffice: number; scopeLabel: string;
}

/** Centred attendance summary: rate ring plus today's headcounts. Every figure comes from the dashboard payload; rate is present ÷ total. */
export function AttendanceOverview({ total, present, absent, late, remote, inOffice, scopeLabel }: AttendanceOverviewProps) {
  const { c } = useTheme();
  const { isMobile } = useBreakpoint();
  const rate = pct(present, total);
  const metrics: { label: string; value: number | string; color: string }[] = [
    { label: scopeLabel, value: total, color: c.text },
    { label: 'Present', value: present, color: c.success },
    { label: 'Absent', value: absent, color: c.danger },
    { label: 'Late', value: late ?? '—', color: c.warning },
    { label: 'Remote', value: remote, color: c.accent },
  ];
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ alignItems: 'center' }}>
        <T v="h3" accessibilityRole="header" style={{ textAlign: 'center' }}>Attendance overview</T>
        <T v="small" muted style={{ textAlign: 'center' }}>Today · {inOffice} in office, {remote} remote</T>
      </View>
      <View style={{ alignItems: 'center' }}>
        <AttendanceRadialChart maxSize={isMobile ? 190 : 220} centerValue={`${rate}%`} centerLabel="attendance rate" rings={[
          { label: 'Attendance rate', detail: `${present} of ${total} present`, percent: rate, color: c.chart[0] },
          { label: 'Remote share', detail: `${remote} of ${present} present`, percent: pct(remote, present), color: c.chart[1] },
          { label: 'Absent', detail: `${absent} of ${total}`, percent: pct(absent, total), color: c.danger },
        ]} />
      </View>
      <Divider />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 14 }}>
        {metrics.map((m) => (
          <View key={m.label} style={{ flexGrow: 1, flexBasis: isMobile ? '33%' : '18%', minWidth: 90, alignItems: 'center', gap: 2 }}>
            <T v="h2" color={m.color} style={{ textAlign: 'center' }}>{m.value}</T>
            <T v="small" muted style={{ textAlign: 'center' }}>{m.label}</T>
          </View>
        ))}
      </View>
    </Card>
  );
}
