import { describe, expect, it } from 'vitest';
import { getOrderGrossCoverage } from './grossCoverage';
import type { MaterialNeed } from './types';

const need = { materialCode: 'FIO', unit: 'kg', coveragePct: 65 } as MaterialNeed;
describe('cobertura bruta de OP', () => {
  it('não inventa 100% para ficha vazia ou componente incompleto', () => {
    expect(getOrderGrossCoverage([], [need])).toBeNull();
    expect(getOrderGrossCoverage([{ name: 'Sem código', quantity: 2, unit: 'kg' }], [need])).toBeNull();
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 0, unit: 'kg' }], [need])).toBeNull();
  });
  it('não compara saldos em unidades diferentes ou sem necessidade calculada', () => {
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 2, unit: 'm' }], [need])).toBeNull();
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 2, unit: 'kg' }], [])).toBeNull();
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 2, unit: 'kg' }], [{ ...need, coverageKnown: false }])).toBeNull();
  });
  it('retorna menor cobertura bruta dos materiais válidos', () => {
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 2, unit: 'kg' }], [need])).toBe(65);
    expect(getOrderGrossCoverage([{ code: 'FIO', quantity: 2, unit: 'kg' }, { code: 'COR', quantity: 1, unit: 'l' }],
      [need, { materialCode: 'COR', unit: 'l', coveragePct: 20 } as MaterialNeed])).toBe(20);
  });
});
