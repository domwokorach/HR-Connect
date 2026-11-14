import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { View } from 'react-native';
import { useGlass } from '@/hooks/useGlass';

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * Backdrop for a floating bar. Order of preference:
 * 1. native Liquid Glass (iOS 26+, API verified at runtime);
 * 2. a real-time blur with a translucent tint;
 * 3. an opaque surface when the user has turned on Reduce Transparency.
 */
export function GlassSurface({ dark }: { dark: boolean }) {
  const { native, solid } = useGlass();
  if (!native && solid) {
    return <View pointerEvents="none" style={[FILL, { backgroundColor: dark ? '#0F1C36' : '#F8FAFC' }]} />;
  }
  return (
    <>
      {native
        ? <GlassView glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} tintColor={dark ? 'rgba(11,23,48,0.35)' : 'rgba(255,255,255,0.25)'} style={FILL} />
        : <>
            <BlurView intensity={dark ? 55 : 70} tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={FILL} />
            <View pointerEvents="none" style={[FILL, { backgroundColor: dark ? 'rgba(11,23,48,0.38)' : 'rgba(255,255,255,0.32)' }]} />
          </>}
      {/* specular highlight along the upper edge (the system material draws its own edge, so only the fallback needs it) */}
      {native ? null : <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 22, right: 22, height: 1, backgroundColor: dark ? 'rgba(190,205,235,0.35)' : 'rgba(255,255,255,0.9)' }} />}
    </>
  );
}
