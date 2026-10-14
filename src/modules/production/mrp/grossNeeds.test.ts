import { describe, expect, it } from 'vitest';
import { calculateGrossMaterialNeeds, getUniqueSheet } from './grossNeeds';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { SupplyItem } from '@/hooks/inventory/useSupplyStock';
import type { SheetLike } from '@/lib/pcp/types';

const order = { id: 'o1', order_number: 'OP-1', product_id: 'p1', product_code: 'P1', quantity: 10, produced_quantity: 0, status: 'planned' } as ProductionOrderRow;
const sheet: SheetLike = { product_id: 'p1', product_code: 'P1', materials: [{ code: 'FIO', quantity: 2, unit: 'kg' }] };
const stock = (unit: string, quantity: number) => ({ code: 'FIO', name: 'Fio', unit, current_quantity: quantity }) as SupplyItem;

describe('MRP bruto com unidades verificadas', () => {
  it('nunca interpreta saldo em metros como kg nem inventa zero para fonte ausente', () => {
    for (const supplies of [[], [stock('m', 100)]]) {
      const [need] = calculateGrossMaterialNeeds([order], [sheet], supplies);
      expect(need.totalRequired).toBe(20);
      expect(need.coverageKnown).toBe(false);
      expect(need.status).toBe('unverified');
      expect(need.deficit).toBe(0);
    }
  });
  it('só compara código e unidade exatos, sem mistura por nome ou duplicata', () => {
    const [need] = calculateGrossMaterialNeeds([order], [sheet], [stock('kg', 5)]);
    expect(need.coverageKnown).toBe(true);
    expect(need.deficit).toBe(15);
    expect(need.coveragePct).toBe(25);
    expect(calculateGrossMaterialNeeds([order], [sheet], [stock('kg', 5), stock('kg', 8)])[0].coverageKnown).toBe(false);
  });
  it('não combina o mesmo código em unidades diferentes nem converte implicitamente', () => {
    const twoUnits = { ...sheet, materials: [{ code: 'FIO', quantity: 2, unit: 'kg' }, { code: 'FIO', quantity: 3, unit: 'm' }] };
    const needs = calculateGrossMaterialNeeds([order], [twoUnits], [stock('kg', 20)]);
    expect(needs).toHaveLength(2);
    expect(needs.find(n => n.unit === 'kg')?.coverageKnown).toBe(true);
    expect(needs.find(n => n.unit === 'm')?.coverageKnown).toBe(false);
  });
  it('não escolhe revisão de ficha ambígua ou produto sem identidade', () => {
    expect(getUniqueSheet(order, [sheet, { ...sheet }])).toBeNull();
    expect(calculateGrossMaterialNeeds([order], [sheet, { ...sheet }], [stock('kg', 20)])).toEqual([]);
    expect(getUniqueSheet({ ...order, product_id: null, product_code: '' }, [sheet])).toBeNull();
  });
  it('não inclui ficha inválida ou OP com quantidade pendente não finita', () => {
    expect(calculateGrossMaterialNeeds([order], [{ ...sheet, materials: [{ code: 'FIO', quantity: 2 }] }], [stock('kg', 20)])).toEqual([]);
    expect(calculateGrossMaterialNeeds([{ ...order, quantity: Number.NaN }], [sheet], [stock('kg', 20)])).toEqual([]);
  });
});
