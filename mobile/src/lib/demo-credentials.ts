/**
 * Demo account credentials. Imported ONLY by the demo card, which login.tsx loads behind an `__DEV__` guard,
 * so Metro leaves this module out of production bundles. The matching account must exist only in an isolated
 * dev database (`SEED_PASSWORD=abc1234 npm run db:seed`).
 */
export const DEMO_ADMIN = { email: 'admin@hrconnect.dev', password: 'abc1234' } as const;
