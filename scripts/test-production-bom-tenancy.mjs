import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('BOM future writes require both products in the owning company', () => {
  const sql = read('supabase/migrations/20261013230000_validate_production_bom_tenancy.sql');
  const audit = read('.lovable/tests/production-bom-tenant-preflight.sql');
  const catalog = read('.lovable/tests/production-bom-tenant-catalog.sql');
  for (const condition of ['p.company_id = NEW.company_id', 'c.company_id = NEW.company_id', 'NEW.product_id = NEW.component_id']) {
    assert.ok(sql.includes(condition), condition);
    assert.ok(catalog.includes(condition), condition);
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE OF company_id, product_id, component_id, quantity, waste_percentage/);
  assert.match(sql, /NEW.quantity <= 0 OR NEW.quantity = 'NaN'::numeric/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(audit, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(audit, /ROLLBACK;/);
  assert.match(audit, /component_company_mismatch/);
});
