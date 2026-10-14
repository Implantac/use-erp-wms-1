import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/${path}`, import.meta.url), 'utf8');
test('MRP screen does not publish fabricated gross deficit/cost for unknown unit or stock', () => {
  const needs = read('mrp/MRPNeedsTab.tsx');
  const purchase = read('mrp/MRPPurchaseTab.tsx');
  const page = read('MRPPage.tsx');
  assert.match(needs, /m.coverageKnown \?/);
  assert.match(purchase, /m.coverageKnown && m.deficit > 0/);
  assert.doesNotMatch(purchase, /unit_cost|Custo estimado total|estCost/);
  assert.match(page, /title="Não verificáveis"/);
  assert.doesNotMatch(page, /totalDeficitValue|title="Custo estimado"/);
});
