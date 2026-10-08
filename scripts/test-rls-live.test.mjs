import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const base = {
  RLS_TEST_SUPABASE_URL: 'http://127.0.0.1:1', RLS_TEST_ANON_KEY: 'sb_publishable_test',
  RLS_A_EMAIL: 'a@example.test', RLS_A_PASSWORD: 'test', RLS_A_COMPANY_ID: 'a', RLS_A_STOCK_BALANCE_ID: 'a', RLS_A_NFE_ID: 'a',
  RLS_B_EMAIL: 'b@example.test', RLS_B_PASSWORD: 'test', RLS_B_COMPANY_ID: 'b', RLS_B_STOCK_BALANCE_ID: 'b', RLS_B_NFE_ID: 'b',
};
const run = overrides => spawnSync(process.execPath, ['scripts/test-rls-live.mjs'], {
  encoding: 'utf8', env: { PATH: process.env.PATH, ...base, ...overrides },
});
test('live RLS refuses missing fixtures rather than passing', () => {
  const result = run({ RLS_B_NFE_ID: '' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /NÃO EXECUTADO/);
});
test('live RLS rejects service-role keys and same-tenant fixtures before login', () => {
  const privileged = run({ RLS_TEST_ANON_KEY: 'sb_secret_test' });
  assert.equal(privileged.status, 2);
  assert.match(privileged.stderr, /BLOQUEADO/);
  const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`;
  assert.equal(run({ RLS_TEST_ANON_KEY: jwt }).status, 2);
  const sameTenant = run({ RLS_B_COMPANY_ID: 'a' });
  assert.notEqual(sameTenant.status, 0);
});
