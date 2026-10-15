import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration = readFileSync(new URL('../docs/governance/sql/DRAFT_guard_machine_time_entry_ownership.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/production-machine-preflight.sql', import.meta.url), 'utf8');
test('machine claims serialize under a machine row lock and reject competing active entries', () => {
  assert.match(migration, /WHERE id = NEW\.machine_id FOR UPDATE/);
  assert.match(migration, /e\.id <> NEW\.id/);
  assert.match(migration, /e\.status IN \('started', 'paused'\)/);
  assert.match(migration, /RAISE EXCEPTION 'Machine is already assigned/);
});
test('privileged trigger explicitly checks machine and OP tenant ownership', () => {
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(migration, /v_machine\.company_id IS DISTINCT FROM NEW\.company_id/);
  assert.match(migration, /o\.company_id = NEW\.company_id/);
  assert.match(migration, /NEW\.company_id IS DISTINCT FROM OLD\.company_id/);
  assert.match(migration, /NEW\.machine_id IS DISTINCT FROM OLD\.machine_id/);
});
test('migration fails closed on conflicting legacy active entries, never deletes data', () => {
  assert.match(migration, /HAVING count\(\*\) > 1/);
  assert.match(migration, /Active time entries reference machines of another company/);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TRIGGER\b/i);
});
test('read-only preflight exposes conflicts without writes', () => {
  for (const issue of ['active_machine_company_mismatch', 'active_machine_multiple_entries', 'active_entry_order_company_mismatch', 'active_machine_missing', 'active_machine_inactive']) {
    assert.ok(preflight.includes(issue));
  }
  assert.doesNotMatch(preflight, /\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i);
});
