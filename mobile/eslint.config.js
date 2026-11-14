// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    // Vendored BNA UI sources (installed with `npx bna-ui add`, upstream style). Lint our own code only.
    ignores: [
      'src/components/ui/!(index).tsx',
      'src/components/charts/!(index).tsx',
      'src/hooks/useColor.ts', 'src/hooks/useColorScheme*.ts', 'src/hooks/useHaptics.ts', 'src/hooks/useKeyboardHeight.ts', 'src/hooks/useModeToggle.tsx',
      'src/providers/**', 'src/theme/colors.ts', 'src/theme/globals.ts',
    ],
  },

  expoConfig,
  {
    ignores: ['dist/*'],
  },
]);
