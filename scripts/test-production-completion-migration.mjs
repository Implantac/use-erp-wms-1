import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261013210000_block_unverified_production_completion.sql', import.meta.url), 'utf8');
const stagingProof = readFileSync(new URL('../.lovable/tests/production-completion-block.sql', import.meta.url), 'utf8');
test('migration blocks completed inserts and transitions before stock trigger', () => {
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.production_orders/);
  assert.match(migration, /TG_OP = 'INSERT'[\s\S]*NEW\.status = 'completed'/);
  assert.match(migration, /OLD\.status IS DISTINCT FROM NEW\.status/);
  assert.match(migration, /ERRCODE = '42501'/);
  assert.match(migration, /RETURN NEW/);
  assert.match(stagingProof, /fixture_required/);
  assert.match(stagingProof, /production_completion_not_blocked/);
  assert.match(stagingProof, /^ROLLBACK;$/m);
});
