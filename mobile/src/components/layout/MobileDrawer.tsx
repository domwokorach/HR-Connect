import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SidebarPanel, useSidebarColors } from './AppSidebar';

/**
 * Phone drawer: the same navigation as the desktop sidebar, sliding in from the left over a dimmed backdrop.
 * Closes from the close button, the backdrop, the Android back button, or a swipe left. Core Animated + PanResponder only,
 * so it runs in Expo Go with no extra native modules. It is a modal overlay, never a second tab bar.
 */
export function MobileDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const k = useSidebarColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const w = Math.min(320, Math.round(width * 0.86));
  const [x] = useState(() => new Animated.Value(-320));

  useEffect(() => {
    if (!visible) return;
    x.setValue(-w);
    Animated.timing(x, { toValue: 0, duration: reduce ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, w, x, reduce]);

  const close = () => Animated.timing(x, { toValue: -w, duration: reduce ? 0 : 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onClose());

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_e, g) => {
      if (g.dx < -w * 0.3 || g.vx < -0.6) Animated.timing(x, { toValue: -w, duration: 160, useNativeDriver: true }).start(() => onClose());
      else Animated.timing(x, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    },
  }), [x, w, onClose]);
  const backdrop = x.interpolate({ inputRange: [-w, 0], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,23,48,0.5)', opacity: backdrop }}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
        </Animated.View>
        <Animated.View {...pan.panHandlers} accessibilityViewIsModal
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w, transform: [{ translateX: x }], backgroundColor: k.bg, borderRightWidth: 1, borderRightColor: k.border, paddingTop: insets.top,
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 4, height: 0 }, elevation: 12 }}>
          <SidebarPanel onClose={close} onNavigate={close} bottomInset={insets.bottom} />
        </Animated.View>
      </View>
    </Modal>
  );
}
