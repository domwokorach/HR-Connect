import { Component, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Logo } from '@/components/brand/Logo';
import { BRAND } from '@/components/brand/logo-geometry';

/** Fallback screen. Deliberately independent of theme/auth/router providers so it still renders when one of them is what failed. */
export function ErrorScreen({ error, onReload }: { error?: Error | null; onReload: () => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.card}>
        <Logo variant="onLight" maxWidth={240} />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>HR Connect hit an unexpected problem. Please reload the page. If it keeps happening, contact your administrator.</Text>
        <Pressable onPress={onReload} style={styles.button} accessibilityRole="button" accessibilityLabel="Reload"><Text style={styles.buttonText}>Reload</Text></Pressable>
        {__DEV__ && error ? <Text style={styles.dev} selectable>{`${error.name}: ${error.message}`}</Text> : null}
      </View>
    </View>
  );
}

const reload = () => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload(); };

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { if (__DEV__) console.error('[AppErrorBoundary]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen error={this.state.error} onReload={Platform.OS === 'web' ? reload : () => this.setState({ error: null })} />;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.greyLight, padding: 24 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 16, backgroundColor: BRAND.white, borderRadius: 16, padding: 28 },
  title: { fontSize: 20, fontWeight: '700', color: BRAND.navyDark, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: BRAND.greyDark, textAlign: 'center' },
  button: { backgroundColor: BRAND.navyDark, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  buttonText: { color: BRAND.white, fontSize: 16, fontWeight: '600' },
  dev: { fontSize: 12, color: '#B91C1C', textAlign: 'center' },
});
