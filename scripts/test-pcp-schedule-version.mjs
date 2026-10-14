import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../supabase/functions/pcp-schedule/index.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/modules/production/kanban/hooks/useKanbanActions.ts', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/modules/production/kanban/SequenceDialog.tsx', import.meta.url), 'utf8');
test('sequence preview must contain every OP; apply rejects stale preview and write failures', () => {
  assert.match(server, /if \(sequence\.length > 100\)/);
  assert.match(server, /action: "suggest", snapshot/);
  assert.match(server, /body\.expectedSnapshot !== snapshot/);
  assert.match(server, /\.eq\("updated_at", version\)\.select\("id"\)/);
  assert.match(server, /if \(error \|\| !written\?\.length\)/);
  assert.doesNotMatch(server, /sequence: sequence\.slice\(0, 100\)|setupReduction:/);
  assert.match(hook, /data\.sequence\?\.length !== data\.totalOrders/);
  assert.match(hook, /action: 'apply', expectedSnapshot/);
  assert.match(dialog, /!result\?\.snapshot/);
  assert.doesNotMatch(dialog, /Redução Setup/);
});
