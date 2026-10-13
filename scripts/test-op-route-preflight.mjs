import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('route audit is read-only and follow-up rejects ambiguous operations', () => {
  const audit = read('.lovable/tests/op-route-preflight-readonly.sql');
  const sql = read('supabase/migrations/20261013214500_reject_ambiguous_op_route_operations.sql');
  assert.match(audit, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(audit, /ROLLBACK;/);
  for (const finding of ['route_without_company', 'route_product_company_mismatch', 'route_step_company_mismatch', 'route_without_steps', 'missing_active_operation', 'ambiguous_active_operation']) assert.ok(audit.includes(finding), finding);
  assert.match(sql, /v_step_count <> 1/);
  assert.match(sql, /array_agg\(ps\.id ORDER BY ps\.id\)/);
  for (const filter of ['r.company_id = NEW.company_id', 'rs.company_id = NEW.company_id', 'ps.company_id = NEW.company_id', 'p.company_id = NEW.company_id']) assert.ok(sql.includes(filter), filter);
  assert.match(sql, /SECURITY DEFINER/);
});
