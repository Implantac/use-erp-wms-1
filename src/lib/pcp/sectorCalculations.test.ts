import { describe, expect, it } from 'vitest';
import { bathVolumeLiters, bomComposition, componentTotalsForBatch, deltaE76 } from './sectorCalculations';

describe('bomComposition — composição planejada da BOM', () => {
  it('normaliza as quantidades por unidade de saída', () => {
    const result = bomComposition([
      { componentName: 'Algodão', componentUnit: 'kg', quantity: 0.7 },
      { componentName: 'Poliéster', componentUnit: 'kg', quantity: 0.3 },
    ]);
    expect(result[0]).toMatchObject({ name: 'Algodão', pct: 70 });
    expect(result[1]).toMatchObject({ name: 'Poliéster', pct: 30 });
  });

  it('sem BOM válida, devolve vazio (nada presumido)', () => {
    expect(bomComposition([])).toEqual([]);
    expect(bomComposition([{ componentName: 'X', componentUnit: 'kg', quantity: 0 }])).toEqual([]);
  });
});

describe('bathVolumeLiters — volume do banho configurado', () => {
  it('peso × relação de banho', () => {
    expect(bathVolumeLiters(200, 8)).toBe(1600);
  });
  it('sem peso ou sem relação, não calcula', () => {
    expect(bathVolumeLiters(null, 8)).toBeNull();
    expect(bathVolumeLiters(200, null)).toBeNull();
    expect(bathVolumeLiters(0, 8)).toBeNull();
  });
});

describe('componentTotalsForBatch — receita configurada p/ o tamanho da partida', () => {
  it('multiplica a quantidade por unidade pela quantidade planejada', () => {
    const result = componentTotalsForBatch(
      [{ componentName: 'Corante Azul', componentUnit: 'kg', quantity: 0.02 }],
      500,
    );
    expect(result).toEqual([{ name: 'Corante Azul', unit: 'kg', total: 10 }]);
  });
  it('sem quantidade planejada, devolve vazio', () => {
    expect(componentTotalsForBatch([{ componentName: 'C', componentUnit: 'kg', quantity: 1 }], null)).toEqual([]);
  });
});

describe('deltaE76 — diferença de cor medida', () => {
  it('zero quando medição iguala a meta; 5 num desvio 3-4-5', () => {
    expect(deltaE76({ l: 50, a: 10, b: -20 }, { l: 50, a: 10, b: -20 })).toBe(0);
    expect(deltaE76({ l: 50, a: 10, b: -20 }, { l: 53, a: 14, b: -20 })).toBeCloseTo(5);
  });
  it('exige meta e medição completas', () => {
    expect(deltaE76({ l: 50, a: 10 }, { l: 50, a: 10, b: 0 })).toBeNull();
    expect(deltaE76(null, { l: 50, a: 10, b: 0 })).toBeNull();
  });
});
