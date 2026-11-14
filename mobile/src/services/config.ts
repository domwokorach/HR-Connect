import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the Express API lives. Override with EXPO_PUBLIC_API_URL.
 * - Expo Go on a phone: uses the dev machine's LAN address from the Metro host (so `localhost` is never used on a device).
 * - Expo Web: same host the page was loaded from, port 4000.
 */
export function apiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    // Port 4000 is a local-dev convenience only; a deployed site must set EXPO_PUBLIC_API_URL (https).
    if (/^(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3})$/.test(host)) return `http://${host}:4000`;
    return '';
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000`;
}
