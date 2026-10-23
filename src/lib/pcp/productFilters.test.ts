import { describe, expect, it } from 'vitest';

import { filterYarnProducts, isYarnProduct, machineMatchesSector } from './productFilters';

describe('isYarnProduct — urdume/trama só podem ser fio', () => {
  it('aceita fio por código e por nome iniciado por Fio', () => {
    expect(isYarnProduct({ id: '1', code: 'FIO-30-CARD', name: 'Fio 30/1 cardado' })).toBe(true);
    expect(isYarnProduct({ id: '2', code: 'FIO-URD-30', name: 'Fio 30/1 para urdume' })).toBe(true);
    expect(isYarnProduct({ id: '3', code: 'ALG-F30', name: 'Fio de algodão 30/1' })).toBe(true);
  });

  it('rejeita pluma, corante e malha (mesmo citada com fio)', () => {
    expect(isYarnProduct({ id: '4', code: 'PLUMA-01', name: 'Algodão em pluma' })).toBe(false);
    expect(isYarnProduct({ id: '5', code: 'CORANTE-AZUL', name: 'Corante reativo azul' })).toBe(false);
    expect(isYarnProduct({ id: '6', code: 'MALHA-30', name: 'Malha fio 30 crua' })).toBe(false);
  });

  it('aceita pela categoria ou subcategoria de fio', () => {
    expect(isYarnProduct({ id: '7', code: 'ALG-01', name: 'Algodão penteado', category_name: 'Fios' })).toBe(true);
    expect(isYarnProduct({ id: '8', code: 'LIN-01', name: 'Linha de costura', subcategory: 'Fios sintéticos' })).toBe(true);
  });

  it('filterYarnProducts preserva o produto já salvo fora do filtro', () => {
    const products = [
      { id: 'fio', code: 'FIO-01', name: 'Fio 01' },
      { id: 'malha', code: 'MALHA-01', name: 'Malha 01' },
    ];
    expect(filterYarnProducts(products).map((p) => p.id)).toEqual(['fio']);
    expect(filterYarnProducts(products, 'malha').map((p) => p.id)).toEqual(['malha', 'fio']);
  });
});

describe('machineMatchesSector — máquina/recurso do próprio setor', () => {
  it('aceita o mesmo setor e rejeita outro setor têxtil', () => {
    expect(machineMatchesSector('Tecelagem', 'tecelagem')).toBe(true);
    expect(machineMatchesSector('Fiação', 'tecelagem')).toBe(false);
    expect(machineMatchesSector('Tinturaria', 'malharia')).toBe(false);
    expect(machineMatchesSector('Malharia', 'malharia')).toBe(true);
  });

  it('não esconde item sem setor cadastrado', () => {
    expect(machineMatchesSector(null, 'tecelagem')).toBe(true);
    expect(machineMatchesSector('', 'fiacao')).toBe(true);
    expect(machineMatchesSector('Preparação', 'tecelagem')).toBe(true);
  });
});

describe('insumos-chave por setor (prontidão)', () => {
  it('reconhece fibra/pluma e corante sem confundir com fio', async () => {
    const { isFiberProduct, isDyeProduct } = await import('./productFilters');
    expect(isFiberProduct({ id: '1', code: 'PLUMA-01', name: 'Algodão em pluma' })).toBe(true);
    expect(isFiberProduct({ id: '2', code: 'FIO-30', name: 'Fio 30/1' })).toBe(false);
    expect(isDyeProduct({ id: '3', code: 'CORANTE-AZUL', name: 'Corante reativo azul' })).toBe(true);
    expect(isDyeProduct({ id: '4', code: 'MALHA-30', name: 'Malha fio 30 crua' })).toBe(false);
  });
});

describe('catálogo por processo (categorias alimentam os seletores)', () => {
  it('urdume/trama listam só a categoria Fios — nada de tecido, malha, corante ou pluma', async () => {
    const { filterYarnProducts } = await import('./productFilters');
    const catalogo = [
      { id: '1', code: 'PLUMA-INT', name: 'Algodão em pluma (integração)', category_name: 'Fibras e Plumas' },
      { id: '2', code: 'FIO-INT-30', name: 'Fio 30/1 cardado (integração)', category_name: 'Fios' },
      { id: '3', code: 'FIO-30-PENT', name: 'Fio 30/1 penteado', category_name: 'Fios' },
      { id: '4', code: 'TECIDO-SARJA-21', name: 'Tecido sarja 2/1 cru', category_name: 'Tecidos Planos' },
      { id: '5', code: 'MALHA-PIQUET', name: 'Malha piquet crua', category_name: 'Malhas' },
      { id: '6', code: 'CORANTE-PRETO', name: 'Corante reativo preto', category_name: 'Corantes e Auxiliares' },
    ];
    expect(filterYarnProducts(catalogo).map((p) => p.id)).toEqual(['2', '3']);
  });
});
