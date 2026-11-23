/** Sign-in layout modes, matching the Figma frames: desktop split (1440), tablet stacked (834), mobile compact (390). */
export type AuthLayoutMode = 'split' | 'stacked' | 'compact';

export const SPLIT_MIN_WIDTH = 1024;
export const STACKED_MIN_WIDTH = 600;
/** Share of the window taken by the photographic brand panel in the split layout. */
export const HERO_SHARE = 0.52;
/** Max width of the sign-in form column (Figma). */
export const FORM_MAX_WIDTH = 420;

export function authLayoutMode(width: number): AuthLayoutMode {
  if (width >= SPLIT_MIN_WIDTH) return 'split';
  if (width >= STACKED_MIN_WIDTH) return 'stacked';
  return 'compact';
}
