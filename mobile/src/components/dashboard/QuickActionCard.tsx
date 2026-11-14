import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Row, T } from '@/components/ui';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';
import { useTheme } from '@/lib/theme';

export function QuickActionCard({ icon, title, description, href }: { icon: HRIconName; title: string; description: string; href: string }) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href as never)} accessibilityRole="link" accessibilityLabel={`${title}. ${description}`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ backgroundColor: hovered || pressed ? c.surfaceAlt : c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14 })}>
      <Row>
        <View style={{ backgroundColor: c.primarySoft, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}><HRIcon name={icon} size="md" color={c.info} /></View>
        <View style={{ flex: 1 }}><T v="h3">{title}</T><T v="small" muted>{description}</T></View>
        <ChevronRight size={16} color={c.muted} />
      </Row>
    </Pressable>
  );
}
