import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261013213000_scope_op_route_generation_to_company.sql', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../.lovable/tests/op-route-tenant-catalog.sql', import.meta.url), 'utf8');
test('OP route lookup and materialized steps are company-scoped', () => {
  for (const expression of [
    'p.company_id = NEW.company_id',
    'r.company_id = NEW.company_id',
    'rs.company_id = NEW.company_id',
    'ps.company_id = NEW.company_id',
    'NEW.company_id, NEW.id, v_step_id',
  ]) {
    assert.ok(sql.includes(expression), `missing ${expression}`);
    assert.ok(proof.includes(expression), `catalog proof missing ${expression}`);
  }
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /IS DISTINCT FROM NEW\.company_id/);
  assert.match(sql, /RAISE EXCEPTION 'Roteiro da OP não possui etapas válidas/);
});
