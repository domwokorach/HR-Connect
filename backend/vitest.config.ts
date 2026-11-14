import { defineConfig } from 'vitest/config';
import os from 'node:os';

export default defineConfig({
  test: {
    environment: 'node', fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000, globalSetup: ['tests/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${os.userInfo().username}@localhost:5432/hrconnect_test?schema=public`,
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-0123456789',
      UPLOAD_DIR: 'uploads-test',
    },
  },
});
