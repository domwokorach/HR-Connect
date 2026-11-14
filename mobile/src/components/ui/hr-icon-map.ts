/**
 * Single source of truth for HR Connect's icon system.
 *
 * Feature → glyph mapping (21 specified features plus navigation aliases, 18 unique glyphs). Features that share
 * a glyph (tick/completed, pending/in-progress, alert/notifications) resolve to
 * the same component, so nothing is installed or bundled twice.
 */
export const GLYPH_FOR = {
  alert: 'bell',
  clock: 'clock',
  wallet: 'wallet',
  calendar: 'calendar-clock',
  person: 'user',
  tick: 'circle-check',
  alertBell: 'bell-ring',
  completed: 'circle-check',
  inProgress: 'ellipsis',
  overdue: 'circle-x',
  pending: 'ellipsis',
  inOffice: 'house-wifi',
  remote: 'house',
  training: 'graduation-cap',
  benefits: 'gift',
  recruitment: 'users',
  reports: 'chart-column',
  settings: 'settings',
  notifications: 'bell',
  logout: 'log-out',
  appearance: 'sun-moon',
  // structural aliases: navigation destinations that reuse the glyphs above
  dashboard: 'house',
  employees: 'user',
  departments: 'users',
  team: 'users',
  more: 'ellipsis',
} as const;

export type HRIconName = keyof typeof GLYPH_FOR;
export type Glyph = (typeof GLYPH_FOR)[HRIconName];

/** Pixel sizes: sm 16 · md 20 · nav 22 · lg 24. Container sizes follow the spec (36–40 / 40–44 / 44–48). */
export const ICON_SIZE = { sm: 16, md: 20, nav: 22, lg: 24 } as const;
export const CONTAINER_SIZE = { sm: 36, md: 40, nav: 44, lg: 44 } as const;
export type HRIconSize = keyof typeof ICON_SIZE;
/** Stroke is 2 at 16px (stays crisp) and 1.75 above, keeping optical weight constant. */
export const STROKE: Record<HRIconSize, number> = { sm: 2, md: 1.75, nav: 1.75, lg: 1.75 };

export type HRIconTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'inverse';

/** Status features carry a fixed tone so Completed/Overdue/Pending read the same everywhere. */
export const STATUS_TONE: Partial<Record<HRIconName, HRIconTone>> = {
  completed: 'success',
  tick: 'success',
  overdue: 'danger',
  pending: 'warning',
  inProgress: 'info',
};
