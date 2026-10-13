import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('new OP product and route assignments reject cross-company/product references', () => {
  const sql = read('supabase/migrations/20261013223000_validate_op_product_and_route_tenancy.sql');
  const catalog = read('.lovable/tests/op-route-assignment-catalog.sql');
  for (const check of ['p.company_id = NEW.company_id', 'v_route_company IS DISTINCT FROM NEW.company_id', 'v_route_product IS DISTINCT FROM NEW.product_id']) {
    assert.ok(sql.includes(check), check);
    assert.ok(catalog.includes(check), check);
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE OF company_id, product_id, route_id/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /IF NOT FOUND OR/);
});
