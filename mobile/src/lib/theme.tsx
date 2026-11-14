import { useMemo } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useModeContext, type Mode } from '@/providers/mode-provider';
import { usePalette } from '@/providers/palette-provider';
import { Palettes, type PaletteName } from '@/theme/colors';
import { chartColors } from '@/theme/tokens';

export { radius } from '@/theme/spacing';
/** 8-point scale used by the legacy layout helpers (4/8/12/16/24/32). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const soft = {
  light: { primary: '#E6EEF9', success: '#E3F4EC', successText: '#1B7A52', warning: '#FBF1DC', warningText: '#8A5A12', danger: '#FBE7E5', dangerText: '#A93226', info: '#E6EEF9', infoText: '#2B5CA3', accent: '#E9ECF8', accentText: '#3F4E94', alt: '#EDF1F5' },
  dark: { primary: '#1E3350', success: '#14382B', successText: '#7CD3AA', warning: '#3B2D10', warningText: '#E5B864', danger: '#3F1F1F', dangerText: '#F0A09A', info: '#1E3350', infoText: '#9DBFF2', accent: '#26305A', accentText: '#B7C2F0', alt: '#21324A' },
} as const;

const sidebars = {
  navy: { light: ['#0B1830', '#16294A'], dark: ['#101C30', '#1B2B45'] },
  grey: { light: ['#27272A', '#3A3A40'], dark: ['#09090B', '#222226'] },
  brand: { light: ['#0B1830', '#16294A'], dark: ['#0B1830', '#16294A'] },
} as const;
const greySoft = { light: { primary: '#E4E4E7', accent: '#E4E4E7', accentText: '#27272A', alt: '#EFEFF1' }, dark: { primary: '#2E2E33', accent: '#2E2E33', accentText: '#E4E4E7', alt: '#26262A' } } as const;
const greyCharts = { light: ['#3F3F46', '#0D9488', '#B45309', '#6366F1', '#B91C1C', '#71717A'], dark: ['#D4D4D8', '#2DD4BF', '#FBBF24', '#A5B4FC', '#F87171', '#A1A1AA'] } as const;

function build(palette: PaletteName, scheme: 'light' | 'dark') {
  const k = Palettes[palette][scheme];
  const s = { ...soft[scheme], ...(palette === 'grey' ? greySoft[scheme] : {}) };
  const [sb, sbActive] = sidebars[palette][scheme];
  return {
    bg: k.background, surface: k.card, surfaceAlt: s.alt, border: k.border, text: k.foreground, muted: k.mutedForeground,
    primary: k.primary, onPrimary: k.primaryForeground, primarySoft: s.primary,
    sidebar: sb, sidebarText: '#B6C2D9', sidebarActive: sbActive, sidebarAccent: palette === 'grey' ? '#A1A1AA' : '#7AAAF0',
    success: s.successText, successSoft: s.success, warning: s.warningText, warningSoft: s.warning, danger: s.dangerText, dangerSoft: s.danger,
    info: palette === 'grey' ? (scheme === 'light' ? '#3F3F46' : '#E4E4E7') : s.infoText, infoSoft: s.info, accent: s.accentText, accentSoft: s.accent,
    solid: { success: k.green, warning: k.orange, danger: k.red, info: palette === 'grey' ? k.primary : k.blue, accent: k.indigo },
    chart: [...(palette === 'grey' ? greyCharts[scheme] : chartColors[scheme])] as string[],
  };
}
export type Palette = ReturnType<typeof build>;
const palettes = { navy: { light: build('navy', 'light'), dark: build('navy', 'dark') }, grey: { light: build('grey', 'light'), dark: build('grey', 'dark') }, brand: { light: build('brand', 'light'), dark: build('brand', 'light') } };

export const THEMES = [
  { id: 'navy-light', name: 'Navy Light', note: 'Default corporate identity', palette: 'navy', mode: 'light' },
  { id: 'navy-dark', name: 'Navy Dark', note: 'Low-light use', palette: 'navy', mode: 'dark' },
  { id: 'grey-light', name: 'Grey Light', note: 'Neutral, executive', palette: 'grey', mode: 'light' },
  { id: 'grey-dark', name: 'Grey Dark', note: 'Neutral, low-light', palette: 'grey', mode: 'dark' },
] as const;

export function useTheme() {
  const scheme = useColorScheme();
  const ctx = useModeContext();
  const { palette, setPalette } = usePalette();
  return useMemo(() => ({
    c: palettes[palette][scheme], scheme, palette, setPalette, mode: (ctx?.mode ?? 'system') as Mode, setMode: ctx?.setMode ?? (() => {}),
    /** Apply one of the four named themes. */
    setTheme: (id: (typeof THEMES)[number]['id']) => { const t = THEMES.find((x) => x.id === id)!; setPalette(t.palette); ctx?.setMode(t.mode); },
    themeId: `${palette}-${scheme}` as (typeof THEMES)[number]['id'],
  }), [scheme, palette, setPalette, ctx]);
}
export type ThemeMode = Mode;
export { ThemeProvider } from '@/providers/theme-provider';
