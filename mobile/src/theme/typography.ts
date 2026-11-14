import { Platform, type TextStyle } from 'react-native';

/**
 * HR Connect's typeface is a rounded sans:
 * - iOS: `ui-rounded`, which React Native resolves to Apple's SF Pro Rounded (system design, with Dynamic Type). No font files.
 * - Android and web: Nunito (SIL Open Font License), loaded through expo-font — see `useAppFonts`.
 * Apple's font files are never bundled or redistributed.
 */
export const WEB_FONT_STACK = 'Nunito_400Regular, ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// No Nunito Bold: 700-weight text uses SemiBold on Android/web (see `nunitoFor`). iOS keeps the system rounded bold.
const NUNITO = { 400: 'Nunito_400Regular', 500: 'Nunito_500Medium', 600: 'Nunito_600SemiBold', 800: 'Nunito_800ExtraBold' } as const;
type Key = 400 | 500 | 600 | 700 | 800;
const nunitoFor = (k: Key): string => NUNITO[(k === 700 ? 600 : k) as keyof typeof NUNITO];

export type Weight = '400' | '500' | '600' | '700' | '800';

// Nunito must be loaded before it can be named; until then (or if loading fails) text uses the platform default.
let nunitoReady = false;
export function setAppFontsReady(ready: boolean): void { nunitoReady = ready; }

const keyFor = (weight: TextStyle['fontWeight'] | undefined): Key => {
  const n = Number(({ normal: 400, bold: 700 } as Record<string, number>)[String(weight)] ?? weight ?? 400);
  return (n >= 800 ? 800 : n >= 700 ? 700 : n >= 600 ? 600 : n >= 500 ? 500 : 400) as Key;
};

/** Font family for text that can't take a full style (SVG text). */
export function textFamily(weight?: TextStyle['fontWeight']): string | undefined {
  if (Platform.OS === 'ios') return 'ui-rounded';
  return nunitoReady ? nunitoFor(keyFor(weight)) : undefined;
}

/** Family + weight for any text. Use for raw `Text`, `TextInput` and SVG text so every surface shares one typeface. */
export function appFont(weight?: TextStyle['fontWeight']): TextStyle {
  const k = keyFor(weight);
  if (Platform.OS === 'ios') return { fontFamily: 'ui-rounded', fontWeight: String(k) as TextStyle['fontWeight'] };
  // Nunito ships one file per weight, so the weight lives in the family name (leaving fontWeight set would fake-bold it).
  if (nunitoReady) return { fontFamily: nunitoFor(k), fontWeight: undefined };
  return { fontWeight: String(k) as TextStyle['fontWeight'] };
}

/** Type scale (pt). Screen/page headings are bold; section and card headings regular; numerals are tabular (see `T`). */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.3 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },   // main heading
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '400' as const, letterSpacing: -0.2 },   // section heading
  h3: { fontSize: 20, lineHeight: 26, fontWeight: '400' as const, letterSpacing: -0.1 },   // card heading
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },                     // secondary text
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },                     // form labels / field captions
};
