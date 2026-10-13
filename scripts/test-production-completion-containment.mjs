import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('caminhos conhecidos não concluem OP nem anunciam rastreabilidade total', () => {
  assert.match(read('src/services/production/productionService.ts'), /if \(status === 'completed'\) throw/);
  assert.match(read('src/hooks/production/useProductionOrders.ts'), /if \(updates\.status === 'completed'\)/);
  assert.match(read('src/modules/production/pcp/usePCPPanel.ts'), /if \(newStatus === 'completed'\).*return/);
  assert.match(read('src/modules/production/productionOrders/OrdersTable.tsx'), /disabled title="Exige conclusão transacional homologada"/);
  assert.doesNotMatch(read('src/modules/production/ProductionOrders.tsx'), /rastreabilidade total/);
  assert.match(read('src/modules/production/ProductionQueue.tsx'), /disabled title="Conclusão transacional ainda não homologada"/);
  assert.doesNotMatch(read('src/modules/production/kanban/KanbanCard.tsx'), /status: 'completed', icon: CheckCircle/);
  assert.match(read('src/modules/production/kanban/hooks/useKanbanActions.ts'), /if \(newStatus === 'completed'\)/);
  assert.doesNotMatch(read('src/modules/production/OperatorTerminal.tsx'), /updates\.status = 'completed'/);
  assert.match(read('src/hooks/production/useProductionOrders.ts'), /return false;[\s\S]*return true;/);
});
