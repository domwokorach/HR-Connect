import test from 'node:test';
import assert from 'node:assert/strict';
import { authLayoutMode } from '../src/components/auth/layout.ts';

test('authLayoutMode picks the Figma layout for each width', () => {
  assert.equal(authLayoutMode(1440), 'split');
  assert.equal(authLayoutMode(1024), 'split');
  assert.equal(authLayoutMode(1023), 'stacked');
  assert.equal(authLayoutMode(834), 'stacked');
  assert.equal(authLayoutMode(600), 'stacked');
  assert.equal(authLayoutMode(599), 'compact');
  assert.equal(authLayoutMode(390), 'compact');
  assert.equal(authLayoutMode(320), 'compact');
});
