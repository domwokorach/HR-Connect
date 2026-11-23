import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { setAppFontsReady } from '@/theme/typography';

const FONT_TIMEOUT_MS = 4000;

/** Android and web: loads the four Nunito weights in use (per-weight imports, so unused variants aren't bundled). Resolves true once loaded or failed (text then falls back to the platform font). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_800ExtraBold });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS); return () => clearTimeout(t); }, []);
  setAppFontsReady(loaded && !error);
  return loaded || !!error || timedOut; // a stalled font request must not leave the app blank
}
