/**
 * Demo sign-in helper: development builds only. `__DEV__` is false in production bundles, so the
 * credentials below are dead-code eliminated there. It only fills the form; signing in still goes through the API.
 * The matching account must exist only in an isolated dev database (`SEED_PASSWORD=abc1234 npm run db:seed`).
 */
export const DEMO_LOGIN_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DEMO_LOGIN === 'true';
export const DEMO_ADMIN = { email: 'admin@hrconnect.dev', password: 'abc1234' } as const;
