import { appFont } from '@/theme/typography';

/** Typeface + weight for app text (SF Pro Rounded on iOS, Nunito on Android and web). Hook-style name so call sites read like the other theme hooks. */
export const useAppFont = (weight?: Parameters<typeof appFont>[0]) => appFont(weight);
