import { describe, expect, it } from 'vitest';
import { diagnoseSectorReadiness } from './sectorReadiness';

const base = {
  productsTotal: 10,
  productsWithBom: 4,
  eligibleProducts: 2,
  sectorOperations: 3,
  sectorMachines: 2,
  approvedLotsWithBalance: 5,
};

describe('diagnoseSectorReadiness', () => {
  it('empresa com tudo cadastrado está pronta e sem itens pendentes', () => {
    const result = diagnoseSectorReadiness(base, 'fiação');
    expect(result.ready).toBe(true);
    expect(result.companyTrap).toBe(false);
    expect(result.items.every((item) => item.ok)).toBe(true);
  });

  it('empresa sem nenhum produto é a armadilha da empresa errada (holding)', () => {
    const result = diagnoseSectorReadiness(
      { productsTotal: 0, productsWithBom: 0, eligibleProducts: 0, sectorOperations: 0, sectorMachines: 0, approvedLotsWithBalance: 0 },
      'tecelagem',
    );
    expect(result.companyTrap).toBe(true);
    expect(result.ready).toBe(false);
  });

  it('aponta exatamente o elo que falta, com o caminho do cadastro', () => {
    const result = diagnoseSectorReadiness({ ...base, sectorMachines: 0, approvedLotsWithBalance: 0 }, 'tinturaria');
    const missing = result.items.filter((item) => !item.ok);
    expect(missing.map((item) => item.key)).toEqual(['machines', 'lots']);
    expect(missing[0].href).toBe('/producao/maquinas');
    expect(result.ready).toBe(false);
  });

  it('BOM sem roteiro do setor não torna o produto elegível', () => {
    const result = diagnoseSectorReadiness({ ...base, eligibleProducts: 0 }, 'malharia');
    const eligible = result.items.find((item) => item.key === 'eligible');
    expect(eligible?.ok).toBe(false);
    expect(eligible?.href).toBe('/producao/roteiros');
  });
});
