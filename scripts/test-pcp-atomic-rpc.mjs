import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261015000100_atomic_pcp_preview_apply.sql', import.meta.url), 'utf8');
test('single scoped RPC atomically applies versioned PCP plans, service role only', () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION .* TO service_role/);
  assert.match(sql, /company_id = p_company_id AND updated_at = v_version/g);
  assert.match(sql, /branch_id = ANY\(p_branch_ids\)/);
  assert.match(sql, /GET DIAGNOSTICS v_affected = ROW_COUNT/);
  assert.match(sql, /IF v_affected <> 1 THEN[\s\S]*RAISE EXCEPTION/);
  assert.match(sql, /v_sequence <> v_count/);
  assert.match(sql, /v_id = ANY\(v_seen\)/);
});
