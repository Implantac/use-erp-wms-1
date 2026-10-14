import { describe, expect, it } from 'vitest';
import { MRPService } from './mrp';
import type { OrderLike, SheetLike, SupplyLike } from './types';
const op: OrderLike = { id: '1', order_number: 'OP-1', product_id: 'p1', product_code: 'P1', product_name: 'Tecido', quantity: 10, produced_quantity: 0, status: 'planned' };
const sheet: SheetLike = { product_id: 'p1', product_code: 'P1', materials: [{ code: 'FIO', quantity: 2, unit: 'kg' }] };
const supply = (unit: string, quantity: number): SupplyLike => ({ code: 'FIO', name: 'Fio', unit, current_quantity: quantity, unit_cost: 9 });
describe('MRP compartilhado com PCP', () => {
  it('não inventa unidade, saldo ou custo quando falta comparabilidade', () => {
    for (const stocks of [[], [supply('m', 50)], [supply('kg', 4), supply('kg', 8)]]) {
      const [need] = MRPService.calculateNeeds([op], [sheet], stocks);
      expect(need.status).toBe('unverified');
      expect(need.coverageKnown).toBe(false);
      expect(need.deficit).toBe(0);
      const suggestions = MRPService.generateSuggestions([need], [op], []);
      expect(suggestions.some(s => s.title.includes('sem cobertura verificável'))).toBe(true);
      expect(suggestions.some(s => s.estimatedImpact?.includes('Custo'))).toBe(false);
    }
  });
  it('calcula apenas saldo bruto com código e unidade exatos', () => {
    const [need] = MRPService.calculateNeeds([op], [sheet], [supply('kg', 5)]);
    expect(need.totalRequired).toBe(20);
    expect(need.coverageKnown).toBe(true);
    expect(need.coveragePct).toBe(25);
    expect(need.deficit).toBe(15);
  });
  it('separa kg e metros e recusa ficha ambígua/incompleta', () => {
    const two = { ...sheet, materials: [...sheet.materials!, { code: 'FIO', quantity: 1, unit: 'm' }] };
    expect(MRPService.calculateNeeds([op], [two], [supply('kg', 20)])).toHaveLength(2);
    expect(MRPService.calculateNeeds([op], [sheet, { ...sheet }], [supply('kg', 20)])).toEqual([]);
    const suggestions = MRPService.generateSuggestions([], [op], [], [sheet, { ...sheet }]);
    expect(suggestions.some(s => s.title.includes('sem ficha única e completa'))).toBe(true);
    expect(MRPService.calculateNeeds([op], [{ ...sheet, materials: [{ code: 'FIO', quantity: 2 }] }], [supply('kg', 20)])).toEqual([]);
  });
});
