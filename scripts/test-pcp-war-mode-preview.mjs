import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend = readFileSync(new URL('../supabase/functions/pcp-priority/index.ts', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../src/modules/production/kanban/hooks/useKanbanActions.ts', import.meta.url), 'utf8');
test('war mode preview cannot write and confirm requires matching plan version', () => {
  const block = backend.split('if (action === "war_mode") {')[1].split('return new Response(\n      JSON.stringify({ error: "Unknown action.')[0];
  assert.ok(block);
  assert.doesNotMatch(block.split('if (body.confirm === true) {')[0], /\.update\(/);
  assert.match(block, /body\.expectedSnapshot !== snapshot/);
  assert.match(block, /status: 409/);
  assert.match(block, /\.eq\("updated_at", version\)\.select\("id"\)/);
  assert.match(block, /if \(error \|\| !written\?\.length\)/);
  assert.match(frontend, /confirm: true, expectedSnapshot/);
  assert.match(frontend, /!data\?\.snapshot/);
});
