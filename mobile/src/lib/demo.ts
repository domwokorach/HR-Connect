/**
 * Demo sign-in helper: development builds only, and only when explicitly enabled. `__DEV__` is false in production
 * bundles, so this is always false there. The credentials live in `demo-credentials.ts`, which is only required
 * behind this guard. The demo card fills the form; signing in still goes through the API.
 */
export const DEMO_LOGIN_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DEMO_LOGIN === 'true';
