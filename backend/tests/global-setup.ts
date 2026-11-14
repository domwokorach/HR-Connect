import { execSync } from 'node:child_process';
import os from 'node:os';

// Applies the real migrations to the throwaway test database. Create it once:  createdb hrconnect_test
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? `postgresql://${os.userInfo().username}@localhost:5432/hrconnect_test?schema=public`;
  if (!/test/.test(url)) throw new Error('Refusing to run tests against a database whose name does not contain "test"');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
