import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('new OP route FK restricts deletion without asserting legacy integrity', () => {
  const sql = read('supabase/migrations/20261013220000_preserve_op_route_references.sql');
  const audit = read('.lovable/tests/op-route-reference-preflight.sql');
  const catalog = read('.lovable/tests/op-route-reference-catalog.sql');
  const hook = read('src/hooks/production/useProductionRoutes.ts');
  assert.match(sql, /FOREIGN KEY \(route_id\) REFERENCES public\.production_routes \(id\)\s+ON DELETE RESTRICT NOT VALID/);
  assert.doesNotMatch(sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n'), /VALIDATE CONSTRAINT/);
  assert.match(audit, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(audit, /missing_route/);
  assert.match(audit, /route_company_mismatch/);
  assert.match(catalog, /NOT convalidated/);
  assert.match(hook, /Pode estar vinculada a uma OP/);
});
