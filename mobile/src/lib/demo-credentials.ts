/**
 * Demo account credentials. Imported ONLY by the demo card, which login.tsx requires behind an inlined
 * EXPO_PUBLIC_DEMO_LOGIN=true check, so builds without the flag do not contain this module. The matching account must
 * exist only in an isolated demo database with synthetic data (`SEED_PASSWORD=abc1234 npm run db:seed`), never in production.
 */
export const DEMO_ADMIN = { email: 'admin@hrconnect.dev', password: 'abc1234' } as const;
