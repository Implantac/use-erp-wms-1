import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('setup refuses to replay every migration even if a database URL is supplied', () => {
  const result = spawnSync(process.execPath, ['scripts/setup.mjs', '--migrate'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: 'postgresql://example.invalid/fake' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Migração bloqueada/);
  assert.doesNotMatch(result.stdout + result.stderr, /aplicando .*\.sql/);
});
