// Bootstrap the FIRST administrator without touching existing data.  npm run admin:init
// Email: SEED_EMAIL (or ADMIN_EMAIL). Password: SEED_PASSWORD, otherwise a hidden terminal prompt. Never overwrites or resets anything.
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { audit } from '../src/services/audit';
import { todayIn } from '../src/lib/dates';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/services/auth.service';

const fail = (msg: string): never => { console.error(msg); process.exit(1); };

function strong(p: string) {
  if (p.length < 12 || p.length > 128) return 'Password must be 12–128 characters.';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) return 'Password needs lower-case, upper-case, a digit and a symbol.';
  return null;
}

/** Read a line from the terminal without echoing it. */
function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return fail('No interactive terminal: set SEED_PASSWORD, or run this command in a terminal to be prompted.');
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    process.stdout.write(question);
    w._writeToOutput = () => undefined; // suppress echo of typed characters
    rl.question('', (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function main() {
  const email = (process.env.SEED_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Set SEED_EMAIL (or ADMIN_EMAIL) to the administrator email address.');

  // Cheap pre-check so an operator with an existing admin never gets asked for a password.
  const existing = async () => prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const stop = () => fail('An administrator already exists — nothing was changed.\nUse the password recovery flow instead: "Forgot password?" on the sign-in page (POST /api/auth/forgot-password).');
  if (await existing()) stop();
  if (await prisma.user.findUnique({ where: { email } }) || await prisma.employee.findUnique({ where: { email } })) fail(`${email} already belongs to an existing account or employee — nothing was changed.`);

  let password = process.env.SEED_PASSWORD || '';
  if (!password) {
    password = await ask('New administrator password: ');
    if (password !== await ask('Confirm password: ')) fail('Passwords do not match.');
  }
  const weak = strong(password);
  if (weak) fail(weak);
  const passwordHash = await hashPassword(password); // same argon2id helper the login service verifies against

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(947201)`; // serialise concurrent bootstrap runs
    if (await tx.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) return null;
    const tz = (await tx.companySettings.upsert({ where: { id: 1 }, update: {}, create: {} })).timezone;
    const n = await tx.employee.count();
    const user = await tx.user.create({ data: { email, passwordHash, role: 'ADMIN', isActive: true, mustChangePassword: true } });
    const emp = await tx.employee.create({ data: { employeeCode: `EMP-${1001 + n}`, userId: user.id, fullName: process.env.SEED_NAME?.trim() || 'HR Administrator', email, jobTitle: 'HR Administrator', startDate: todayIn(tz) } });
    await audit({ actorId: user.id, action: 'ADMIN_BOOTSTRAP', entity: 'User', entityId: user.id }, tx);
    return { user, emp };
  });
  if (!result) stop();
  console.log(`Created: 1 user (ADMIN, active, must change password) + 1 employee record (${result!.emp.employeeCode}) for ${email}. No other records were changed.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
