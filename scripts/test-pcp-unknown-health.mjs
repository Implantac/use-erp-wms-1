import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('PCP does not infer healthy material and OEE from absent or incomplete inputs', () => {
  const panel = read('components/production/PCPIntelligencePanel.tsx');
  const hook = read('hooks/production/usePCPIntelligence.ts');
  const mrp = read('lib/pcp/mrp.ts');
  assert.doesNotMatch(panel, /PCP saudável|Materiais disponíveis, OPs no prazo, capacidade ok/);
  assert.doesNotMatch(hook, /const oee =|oee: number/);
  assert.match(mrp, /OP\(s\) sem ficha única e completa/);
  assert.match(hook, /generateSuggestions\(materialNeeds, activeOPs, capacities, sheets\)/);
});
