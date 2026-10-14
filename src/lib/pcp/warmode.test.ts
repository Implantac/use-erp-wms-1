import { describe, expect, it } from 'vitest';
import { WarModeService } from './warmode';
import type { OrderLike, MaterialNeed } from './types';
const order = { id: 'op-1', order_number: 'OP-1', product_name: 'Produto', product_code: 'P1', quantity: 10,
  produced_quantity: 0, status: 'waiting_material', priority: 'medium' } as OrderLike;
const need = (coverageKnown: boolean, deficit = 0): MaterialNeed => ({
  materialCode: 'FIO', materialName: 'Fio', unit: 'kg', totalRequired: 10, inStock: 10,
  deficit, coveragePct: 100, coverageKnown, relatedOPs: ['OP-1'], status: coverageKnown ? 'ok' : 'unverified',
});
describe('War Mode suggestions cannot imply material availability from missing data', () => {
  it('withholds start suggestions without verified material requirements', () => {
    expect(WarModeService.execute([order], [], []).kanbanReorg).toEqual([]);
    expect(WarModeService.execute([order], [need(false)], []).kanbanReorg).toEqual([]);
    expect(WarModeService.execute([order], [need(true, 1)], []).kanbanReorg).toEqual([]);
  });
  it('labels verified gross balance as projection, not stock reservation', () => {
    const result = WarModeService.execute([order], [need(true)], []);
    expect(result.kanbanReorg).toHaveLength(1);
    expect(result.kanbanReorg[0].reason).toContain('Projeção bruta');
  });
});
