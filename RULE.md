# HR Connect — Project Rules

Rules for everyone (and every AI assistant) working in this repository. Complements [AGENTS.md](AGENTS.md).

## Stack
- `mobile/` — Expo (SDK 58), React Native, TypeScript, Expo Router (routes in `mobile/src/app/`).
- `backend/` — Express, PostgreSQL, Prisma, custom JWT auth. No Supabase, Firebase or third-party auth.

## Expo
- Expo changes every SDK. Check the `expo` major version in `mobile/package.json` and read the matching docs (`https://docs.expo.dev/versions/v<major>.0.0/`) before touching Expo, EAS or React Native APIs.
- Install packages with `npx expo install <package>`, never `npm add`.
- `ios/` and `android/` are generated. Configure native behaviour in `app.json` and config plugins, never by hand.
- Prefer Expo modules over third-party libraries.

## Security (do not weaken)
- Never change backend auth endpoints, login API contracts, server-side validation, session/token handling, role-based authorisation, login redirects, audit logging or account lockout without an explicit request.
- Accounts are created only by an HR administrator.
- Never log, expose or persist plaintext passwords. Auth errors must not reveal whether an account exists.
- Never commit `.env` files or secrets. Only `.env.example` is tracked.

## Design
- Flat, premium, minimal. No gradients, glass/blur, glow, heavy shadows or mock-up visuals.
- Colours (`mobile/src/components/brand/logo-geometry.ts` → `BRAND`): navy dark `#0B1730`/`#0B1830`, navy light `#243B60`, grey dark `#475569`, grey light `#F1F5F9`, white `#FFFFFF`, border `#CBD5E1`.
- One icon stroke weight; consistent 18–20 px form icons.
- Respect `prefers-reduced-motion` for every animation.
- Layouts must work from small iPhones to desktop web. In wrapping rows use `flexGrow/flexShrink/flexBasis`, not `flex: 1` (it collapses heights on native).
- Accessible labels, visible focus, and labelled controls for every input and icon button.

## Branding
- The app name "HR Connect" (Expo config) and the Home Screen label must not change.
- Logo geometry lives in `logo-geometry.ts`; the app icon is `mobile/assets/images/icon.png` (1024×1024, opaque, no transparency).

## Workflow
- Run `npx expo lint` and `npx tsc --noEmit` in `mobile/` (and `npm run typecheck` in `backend/`) before calling work done.
- Keep changes presentation-only unless the task says otherwise; do not add features, refactors or dependencies that were not asked for.
- Commit messages and PR descriptions carry no AI attribution lines.
