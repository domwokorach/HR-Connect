# HR Connect

Human-resource management for Admin/HR, Manager and Staff. **Expo (React Native, TypeScript, Expo Router) + Express.js + PostgreSQL + Prisma, with custom JWT authentication.** No Supabase, Firebase or third-party auth.

```
hr-connect/
├── mobile/    Expo app (Expo Go on iOS/Android + Expo Web)
│   └── src/{app,components/{ui,layout,dashboard,employees,charts},features,hooks,lib,providers,services,theme}
└── backend/   Express API
    ├── prisma/ (schema.prisma, migrations/, seed.ts)
    └── src/{controllers,routes,middleware,services,validators,lib}
```
(Expo Router lives in `mobile/src/app` as the Expo template expects. One role-aware route tree is used instead of three duplicated `(admin)/(manager)/(staff)` trees; screens adapt to the role and the API enforces it.)

## Quick start
Requirements: Node 20+, PostgreSQL 14+.

```bash
# 1. database + API
createdb hrconnect
cd backend
cp .env.example .env            # set DATABASE_URL and two DIFFERENT 32+ char JWT secrets
npm install
npx prisma migrate deploy       # applies prisma/migrations
npm run db:seed                 # demo data; prints the dev-only password for the 3 demo logins
npm run dev                     # http://localhost:4000

# 2. app (new terminal)
cd mobile
npm install
npx expo start                  # scan the QR code with Expo Go
npx expo start --web            # laptop / browser
```

Demo logins (created by the seed, development only): `admin@hrconnect.dev`, `manager@hrconnect.dev`, `staff@hrconnect.dev`.

**Physical phone:** the phone must reach the API. With Expo Go the app derives the API address from the Metro host (your computer's LAN IP, port 4000), so keep phone and computer on the same Wi‑Fi. If auto-detection is wrong set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000` in `mobile/.env`. Never use `localhost` on a device. For Expo Web served from another origin, add it to `CORS_ORIGINS` in `backend/.env`.


## UI system (BNA UI)
The mobile app uses **[BNA UI](https://ui.ahmedbna.com)** (`npx bna-ui add <name>` copies component source into `src/`). Installed: button, card, input, badge, avatar, tabs, table, progress, toast, alert-dialog, bottom-sheet, combobox, date-picker, file-picker, popover, accordion, skeleton, spinner, searchbar, checkbox, switch, picker, mode-toggle, theme/mode providers, hooks, and the line / area / stacked-area / heatmap / progress-ring / radial-bar / treemap / doughnut / bubble / radar / bar charts (`npx bna-ui list` shows the registry).

- **Tokens:** `src/theme/colors.ts` (light/dark tables using the HR Connect palette: navy `#0F172A`, blue `#2563EB`, indigo `#6366F1`, …), `globals.ts` (radii 12/18, input height 46), `typography.ts` (Inter), `spacing.ts` (8-pt scale), `tokens.ts`. `ThemeProvider`/`ModeProvider` provide light/dark/system and persist the choice.
- **Design tokens (v2):** Light — Primary Navy `#142B49`, Deep Navy `#0B1830`, Secondary Navy `#29476D`, background `#F6F8FB`, surface `#FFFFFF`, secondary surface `#EDF1F5`, text `#17263C`/`#64748B`, border `#E2E8F0`, accent blue `#3974C6`. Dark — background `#0B1220`, sidebar `#101C30`, card `#172438`, elevated `#21324A`, text `#F1F5F9`/`#A7B5C8`, border `#304157`, accent `#7AAAF0`. Typography is Inter (page heading 28/600, section 18/600, card title 15/600, body 14, labels 13/500, supporting 12.5) with tabular numerals; icons are Lucide at a single 1.75 stroke in 16/18/20/24 px; avatars are initials on restrained navy/slate tones; status badges pair colour with an icon.
- **Themes:** four named themes — **Navy Light (default)**, Navy Dark, Grey Light, Grey Dark — chosen in Settings → Appearance (stored per device; optional "match device light/dark"). Palettes live in `theme/colors.ts` (`Palettes`), selected by `providers/palette-provider.tsx`; BNA components and the app UI both read them, so every screen and chart follows the choice.
- **Animated headline:** `components/brand/ColourfulText.tsx` — a React Native port of Aceternity UI's *Colourful Text* (the original needs Tailwind + framer-motion, i.e. a web-only toolchain, so it is re-implemented on Reanimated and works on iOS, Android and web). Only "people operations." animates: per-letter staggered colour transitions every 6 s through navy-blue / royal-blue / muted-cyan / indigo tints chosen for ≥ 4.5:1 contrast on Deep Navy (`onDark`) or on the light page (`onLight`); no blur or flashing; under the OS reduced-motion setting it renders static. The phrase is exposed once to screen readers.
- **Logo / sign-in:** `components/brand/` holds the flat vector logo (`Logo.tsx`, `logo-geometry.ts`; SVG copies in `mobile/assets/images/hr-connect-logo-flat-on-dark.svg`, `…-on-light.svg`, `hr-connect-mark.svg`). The wordmark is outlined from Nunito (SIL OFL). The sign-in and password pages use a fixed flat brand look (Navy Dark `#0B1530`, Navy Light `#243B63`, Grey Light `#F3F4F6`, Grey Dark `#374151`, white) regardless of the user's theme. The original glossy `hr-connect-logo.png` is no longer used.
- **Adapters:** `src/components/ui/index.tsx` wraps the BNA components behind the API the screens use (Button, Card, Field→Input, SelectField→Combobox, DateField→DatePicker, Badge, Avatar, ConfirmDialog→AlertDialog, …). Status badges carry a glyph (✓ ! ✕ ●) so state is never colour-only; charts have plain-text summaries.
- **Layout:** `components/layout/` — 260 px collapsible grouped sidebar (icon-only on tablet), 72 px header with breadcrumbs, employee search, notifications, mode toggle and account menu, mobile bottom tabs (Dashboard · Attendance · Leave · Employees · More) with a bottom sheet.
- The vendored BNA files are excluded from ESLint (upstream style); I patched a few for RN 0.88 ref typings, Inter font, and compact button sizes.

## Authentication design
- `POST /api/auth/login` → **15‑minute signed access JWT** (`sub`, `role`, `type:"access"`, `iat`, `exp`) + **rotating refresh token**.
- Access tokens are verified server-side on every request, and the user's **current role / active flag come from the database**, never from the token or client. Changing a role, deactivating a user, or resetting a password bumps `tokenVersion`, which invalidates outstanding access tokens immediately.
- Refresh tokens are signed JWTs whose **SHA‑256 hash** is stored (never the token). Each refresh revokes the used token and issues a new one in the same *family*; **presenting an already-used token revokes the whole family** (theft detection).
- Native: refresh token in **Expo SecureStore**, access token in memory only. Web: refresh token in an **HttpOnly, SameSite=Lax (Secure in production) cookie** scoped to `/api/auth`; JS never sees it. Requests must carry `X-Client-Type` (forces a CORS preflight, a CSRF defence).
- Passwords: **Argon2id**. Policy 10+ chars with upper/lower/digit. Identical error for unknown email and wrong password (with a dummy hash so timing matches). 5 failures ⇒ 15‑minute lockout; per-IP rate limits on auth endpoints.
- Forgot/reset: generic response, hashed single-use 30‑minute token, reset revokes all sessions. In development the mail "transport" prints the link to the API console; wire `backend/src/services/mailer.ts` to a real provider before production.
- Sign-in has a **Remember session** option: off ⇒ 1-day refresh token, session cookie on web, memory-only token on device.
- Logins are created only by HR (`POST /api/employees` with `login`, or `POST /api/auth/register`).

## Authorisation
Role guards on routes plus **data scoping in the services**: staff see only their own records; managers their direct reports; HR everything. Salary, phone and home address are returned only to HR and to the employee themself (manager and colleague responses omit the fields). Staff may edit only their own phone/address. Nobody can approve their own leave, overtime or correction. Payslips are immutable snapshots visible to their owner and HR (others get 404). Payroll, recruitment and audit logs are HR-only. State transitions (leave, corrections, overtime, payroll) are atomic conditional updates inside transactions, and the leave balance is checked and incremented in one SQL statement.

## Business rules (all server-side)
- Working time is computed in the company time zone (Settings): lateness (with grace), early departure, break deduction (recorded breaks, never less than the schedule's unpaid break), overtime (pending until a manager/HR approves). Weekends and public holidays are never counted as leave days.
- Leave approval updates balances and writes `on_leave` attendance rows; cancelling reverses both.
- Payroll: basic = annual salary ÷ 12 (no proration), enrolled allowance benefits, approved overtime × configured multiplier, bonuses, and **only HR-configured deduction rules**. The seeded rules (15 %, 5 %) are **placeholders, not real tax rates**. Approving a run creates payslips and notifications in one transaction; every sensitive change is written to `AuditLog`.
- Dates without a time (`workDate`, `startDate`, …) are stored as `YYYY-MM-DD` strings so they never shift with time zones.

## API (all under `/api`)
Auth: `POST /auth/login|refresh|logout|forgot-password|reset-password|change-password|register`, `GET /auth/me` · Employees: `GET|POST /employees`, `GET|PATCH|DELETE /employees/:id` (DELETE deactivates) · Attendance: `POST /attendance/clock-in|start-break|end-break|clock-out`, `GET /attendance/today|me|weekly|team`, corrections, overtime review, `POST /attendance/close-day` · Leave: `GET|POST /leaves`, `PATCH /leaves/:id/approve|reject|cancel`, `GET /leaves/balances` · Payroll: `GET /payroll`, `POST /payroll/process`, `PATCH /payroll/:id/approve|paid`, `PATCH /payroll/items/:id/bonus`, `GET /payroll/payslips/me`, deduction rules · Recruitment, training, benefits, notifications, uploads (private files via 2‑minute signed links) · Reports: `GET /reports/dashboard|attendance|payroll|dataset` · Settings, schedules, holidays, leave types, audit log, data export/retention.

## Tests
```bash
createdb hrconnect_test               # once; the suite refuses to run on a DB whose name lacks "test"
cd backend && npm test                # 42 tests: calculations, auth/refresh rotation, RBAC, workflows
cd mobile  && npm test                # 10 unit tests for date/leave/CSV helpers
npm run check                         # typecheck + lint (from repo root)
```
Backend tests run against the real migrations on PostgreSQL and cover: JWT tampering/expiry/role-claim forgery, refresh rotation and reuse detection, lockout, password reset, clock-in/out sequences, time-zone (BST) maths, overtime/correction/leave approvals (including self-approval and cross-team attempts), payroll access, payslip isolation, hiring conversion, training and benefits permissions, and report scoping.

## Production checklist
Serve the API over **HTTPS** behind a TLS proxy (`NODE_ENV=production` enables Secure cookies and `trust proxy`); use long random secrets from a secret manager; set `CORS_ORIGINS` to your web origin only; configure `mailer.ts`; store uploads on durable private storage (the default is a local `uploads/` directory); schedule `POST /attendance/close-day` nightly; back up PostgreSQL; review `npm audit`.

## Known limits
- **UI redesign scope:** the shell, sign-in, dashboard, employees (table + tabbed profile), attendance, leave, payroll, training, benefits, recruitment and reports use the BNA components/tokens. Not done: OTP/MFA, a skills radar (no skills data exists — the radar chart is installed but unused), audio/camera/media components (no workflow needs them), profile photos. Reduced-motion is honoured by the sidebar animation only; BNA's own animations (charts, buttons, skeleton) are not gated. Dark mode was reviewed on the dashboard, attendance, employees, payroll tab and reports; light mode was not visually reviewed screen-by-screen. Tablet breakpoints were not visually checked.
- Dev-mode web console shows react-native-svg prop warnings (`accessible`, responder props); they are harmless noise from the library.
- The mobile screens were exercised in a browser (Expo Web) against the real API for the admin account: login, dashboard, attendance clock‑in/out, payroll and reports. The manager/staff flows are covered by the API tests but were not clicked through in the UI, and **nothing was run on a physical device in Expo Go**.
- Dates/times are typed (`YYYY-MM-DD`, `HH:MM`); notifications are in-app only; PDF export uses `expo-print` (print dialog on web).
- On web the charts log a react-native-svg "Unknown event handler property" dev warning; I did not verify that tap-to-inspect works on web.
# HR-Connect
