import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/${path}`, import.meta.url), 'utf8');
test('PCP does not announce or perform partial client-side OP generation', () => {
  const panel = read('PCPPanel.tsx');
  const helper = read('pcp/usePCPPanel.ts');
  const dialog = read('pcp/GenerateOPDialog.tsx');
  assert.doesNotMatch(helper, /from\('production_orders'\)\.insert|targetStatus: 'in_production'|gerada\(s\)/);
  assert.doesNotMatch(panel, /generateOPFromOrder/);
  assert.match(dialog, /Button disabled title="Geração atômica ainda não homologada"/);
  assert.match(dialog, /prevenção de duplicidade por item/);
});
