import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModeProvider } from '@/providers/mode-provider';
import { PaletteProvider } from '@/providers/palette-provider';
import { Logo } from './Logo';
import { BRAND } from './logo-geometry';

/** Flat single-column shell for auth pages (forgot / reset password): Grey Light page, logo, white bordered card. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <PaletteProvider fixed="brand">
      <ModeProvider defaultMode="light">
        <SafeAreaView style={{ flex: 1, backgroundColor: BRAND.greyLight }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: '100%', maxWidth: 420, gap: 24 }}>
              <View style={{ alignItems: 'center' }}><Logo variant="onLight" maxWidth={260} /></View>
              <View style={{ backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 28, gap: 16, shadowColor: BRAND.navyDark, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
                {children}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </ModeProvider>
    </PaletteProvider>
  );
}
