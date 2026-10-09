import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = 'postgresql://tester:private-test-password@localhost:5432/check?sslmode=disable';
const run = (env = {}) => spawnSync(process.execPath, ['scripts/rls-static-check.mjs', '--require-connection'], {
  cwd: process.cwd(), encoding: 'utf8',
  env: { PATH: process.env.PATH, ...env },
});

test('missing connection is never reported as a passing RLS check', () => {
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /NÃO EXECUTADO/);
});

test('psql printed FAIL is a failure even with exit zero; credentials do not appear in logs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rls-psql-'));
  try {
    const file = join(dir, 'psql');
    writeFileSync(file, '#!/bin/sh\nprintf "FAIL %s\\n" "$PGPASSWORD"\n');
    chmodSync(file, 0o700);
    const result = run({ PATH: `${dir}:${process.env.PATH}`, RLS_CHECK_DATABASE_URL: url });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /private-test-password/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid remote TLS configuration is refused before connecting', () => {
  const result = run({ RLS_CHECK_DATABASE_URL: 'postgresql://u:p@example.test:5432/db?sslmode=disable' });
  assert.equal(result.status, 2);
});

test('catalog scripts raise SQL errors rather than printing FAIL only', () => {
  for (const name of ['edu-rls-static-check.sql', 'mcp-get-order-rls.sql']) {
    const sql = readFileSync(join('.lovable/tests', name), 'utf8');
    assert.match(sql, /RAISE EXCEPTION/);
  }
});
