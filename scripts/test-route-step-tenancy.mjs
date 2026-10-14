import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('future route-step writes validate route, sector, resource and unique active operation', () => {
  const migration = read('supabase/migrations/20261013233000_validate_route_step_tenancy.sql');
  const catalog = read('.lovable/tests/route-step-tenant-catalog.sql');
  const preflight = read('.lovable/tests/route-step-tenant-preflight.sql');
  for (const predicate of ['r.company_id = NEW.company_id', 's.company_id = NEW.company_id', 'res.company_id = NEW.company_id', 'ps.company_id = NEW.company_id', 'v_operation_count <> 1']) {
    assert.ok(migration.includes(predicate), predicate);
    assert.ok(catalog.includes(predicate), predicate);
  }
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF company_id, route_id, step_name, sector_id, resource_id/);
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(preflight, /ROLLBACK;/);
  assert.match(preflight, /resource_sector_mismatch/);
});
