import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'hrc.refreshToken';
const native = Platform.OS !== 'web';

/** Access token: memory only. Refresh token: Keychain/Keystore on native; on web it lives in an HttpOnly cookie that JS can't read. */
let access: string | null = null;
export const getAccess = () => access;
export const setAccess = (t: string | null) => { access = t; };

let memoryRefresh: string | null = null;

export async function getRefresh(): Promise<string | null> {
  if (!native) return null;
  if (memoryRefresh) return memoryRefresh;
  try { return await SecureStore.getItemAsync(KEY); } catch { return null; }
}
/** persist=false ("don't remember me"): keep the refresh token in memory only, so it is gone when the app closes. */
export async function setRefresh(t: string | null, persist = true) {
  if (!native) return;
  memoryRefresh = persist ? null : t;
  if (!persist) { try { await SecureStore.deleteItemAsync(KEY); } catch { /* ignore */ } return; }
  try { if (t) await SecureStore.setItemAsync(KEY, t); else await SecureStore.deleteItemAsync(KEY); } catch { /* ignore */ }
}
export const clientType = native ? 'mobile' : 'web';
