import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('future production line and resource links are checked within one company', () => {
  const sql = read('supabase/migrations/20261013234500_validate_production_resource_links.sql');
  const audit = read('.lovable/tests/production-resource-links-preflight.sql');
  const catalog = read('.lovable/tests/production-resource-links-catalog.sql');
  for (const condition of ['s.company_id = NEW.company_id', 'l.id = NEW.line_id AND l.company_id = NEW.company_id']) {
    assert.ok(sql.includes(condition), condition);
    assert.ok(catalog.includes(condition), condition);
  }
  assert.match(sql, /v_line_sector IS DISTINCT FROM NEW.sector_id/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF company_id, sector_id, line_id/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(audit, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(audit, /ROLLBACK;/);
  assert.match(audit, /resource_line_company_mismatch/);
});
