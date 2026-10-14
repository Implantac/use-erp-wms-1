import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261014130000_freeze_routes_referenced_by_ops.sql', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../.lovable/tests/referenced-route-freeze-catalog.sql', import.meta.url), 'utf8');
test('used route identity and steps cannot be mutated without a new revision', () => {
  for (const part of ['NEW.route_id IS DISTINCT FROM OLD.route_id', 'FOR UPDATE OF r', 'ORDER BY r.id FOR UPDATE OF r', 'tr_block_referenced_route_mutation', 'tr_block_referenced_route_step_mutation']) {
    assert.ok(sql.includes(part), part);
    assert.ok(catalog.includes(part), part);
  }
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.production_routes/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.production_route_steps/);
  assert.match(sql, /IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;\s+RETURN NEW;/);
  assert.match(sql, /SECURITY DEFINER/);
});
