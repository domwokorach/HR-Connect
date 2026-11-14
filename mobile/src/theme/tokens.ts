import { Colors } from './colors';
export { radius, sizes, spacing } from './spacing';
export { appFont, textFamily, type } from './typography';

/** Brand colours from the design spec (single source; also mapped into the BNA colour tables in colors.ts). */
export const brand = {
  navy: '#142B49', blue: '#3974C6', indigo: '#6F7BC4', bgLight: '#F6F8FB', surfaceLight: '#FFFFFF', textLight: '#0F172A', mutedLight: '#64748B',
  success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0', bgDark: '#0B1220', surfaceDark: '#172033',
} as const;

/** Categorical chart palette: distinct hues, colour-blind friendlier ordering. */
export const chartColors = { light: ['#3974C6', '#3FA37A', '#D69E2E', '#6F7BC4', '#C74B45', '#7C8AA0'], dark: ['#7AAAF0', '#5FC29B', '#E5B864', '#9AA8E8', '#EE8C86', '#A7B5C8'] } as const;
export { Colors };
