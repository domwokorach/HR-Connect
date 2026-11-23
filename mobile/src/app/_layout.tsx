import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { LucideProvider } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary, ErrorScreen } from '@/components/AppErrorBoundary';
import { AnimatedSplash } from '@/components/brand/AnimatedSplash';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth';
import { prefsStorage } from '@/lib/storage';
import { useAppFonts } from '@/lib/use-app-fonts';
import { applyWebFont } from '@/lib/web-font';
import { useTheme } from '@/lib/theme';
import { PaletteProvider } from '@/providers/palette-provider';
import { ThemeProvider } from '@/providers/theme-provider';

SplashScreen.preventAutoHideAsync().catch(() => {});
applyWebFont();

function Inner() {
  const { scheme, c } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
    </>
  );
}

/** Expo Router renders this when a route throws. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorScreen error={error} onReload={retry} />;
}

export default function RootLayout() {
  // iOS uses the system rounded font; Android/web load Nunito. Keep the splash up until that settles (success or failure).
  const fontsSettled = useAppFonts();
  useEffect(() => { if (fontsSettled) SplashScreen.hideAsync().catch(() => {}); }, [fontsSettled]);
  if (!fontsSettled) return null;
  return (
    <AppErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaletteProvider storage={prefsStorage}>
        {/* Navy Light is the default; users can pick Navy Dark, Grey Light, Grey Dark (or follow the device) in Settings. */}
        <ThemeProvider storage={prefsStorage} storageKey="hrc.mode" defaultMode="light">
            <ToastProvider>
              <AuthProvider>
                {/* one stroke weight for every icon */}
                <LucideProvider strokeWidth={1.75}>
                  <Inner />
                  <AnimatedSplash />
                </LucideProvider>
              </AuthProvider>
            </ToastProvider>
        </ThemeProvider>
        </PaletteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
