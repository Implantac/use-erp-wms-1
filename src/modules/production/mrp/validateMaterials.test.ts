import { describe, expect, it } from 'vitest';
import { hasValidSheetMaterials } from './validateMaterials';

describe('ficha técnica elegível para projeção', () => {
  it('não aceita vazia ou parcialmente definida', () => {
    expect(hasValidSheetMaterials([])).toBe(false);
    expect(hasValidSheetMaterials([{ code: 'A', quantity: 2, unit: 'kg' }, { quantity: 1, unit: 'm' }])).toBe(false);
    expect(hasValidSheetMaterials([{ code: 'A', quantity: 0, unit: 'kg' }])).toBe(false);
    expect(hasValidSheetMaterials([{ code: 'A', quantity: 1, unit: '' }])).toBe(false);
    expect(hasValidSheetMaterials([{ code: 'A', quantity: 1, unit: 'kg', waste_pct: -1 }])).toBe(false);
  });
  it('aceita componentes explícitos sem impor tecnologia ou processo', () => {
    expect(hasValidSheetMaterials([{ code: 'FIO', quantity: 2, unit: 'kg' }, { componentCode: 'TEC', qty: 1, unit: 'm' }])).toBe(true);
  });
});
