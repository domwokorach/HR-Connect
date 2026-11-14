import { Platform } from 'react-native';
import { WEB_FONT_STACK } from '@/theme/typography';

/**
 * Web only: apply the Nunito stack to the document and to native form controls (which don't inherit it by default).
 * Expo's `single` web output ships its own index.html, so this is set at startup instead of in a custom HTML shell.
 * Nunito (OFL) is loaded by expo-font; until it arrives the stack falls back to the system rounded/sans font.
 */
export function applyWebFont(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('hrc-app-font')) return;
  const style = document.createElement('style');
  style.id = 'hrc-app-font';
  style.textContent = `html, body, button, input, textarea, select { font-family: ${WEB_FONT_STACK}; }\nbody { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`;
  document.head.appendChild(style);
}
