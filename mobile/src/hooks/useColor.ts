import { useColorScheme } from '@/hooks/useColorScheme';
import { usePalette } from '@/providers/palette-provider';
import { Palettes } from '@/theme/colors';

export function useColor(
  colorName: keyof typeof Palettes.navy.light & keyof typeof Palettes.navy.dark,
  props?: { light?: string; dark?: string }
) {
  const theme = useColorScheme() ?? 'light';
  const { palette } = usePalette();
  const colorFromProps = props?.[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Palettes[palette][theme][colorName];
  }
}
