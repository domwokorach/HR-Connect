import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Small sync key/value store for UI preferences (theme mode): localStorage on web, SecureStore on device. */
export const prefsStorage = {
  getItem: (k: string): string | null => {
    try { return Platform.OS === 'web' ? window.localStorage.getItem(k) : SecureStore.getItem(k); } catch { return null; }
  },
  setItem: (k: string, v: string) => {
    try { if (Platform.OS === 'web') window.localStorage.setItem(k, v); else SecureStore.setItem(k, v); } catch { /* preference only */ }
  },
};
