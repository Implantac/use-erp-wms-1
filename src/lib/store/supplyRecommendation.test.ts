import { describe, expect, it } from 'vitest';
import { rankSupplyCandidates } from './supplyRecommendation';

const c = (source_kind: 'LOJA' | 'CD' | 'FABRICA', branch_id: string, quantity: number) => ({ source_kind, branch_id, quantity });

describe('rankSupplyCandidates', () => {
  it('recomenda o CD quando ele cobre o pedido (logística mais curta)', () => {
    const ranked = rankSupplyCandidates([c('FABRICA', 'f1', 100), c('CD', 'cd1', 30), c('LOJA', 'l1', 25)], 20);
    expect(ranked[0].candidate.branch_id).toBe('cd1');
    expect(ranked[0].recommended).toBe(true);
    expect(ranked[0].reason).toMatch(/cobre o pedido inteiro/);
  });

  it('quem cobre vem antes de saldo parcial maior', () => {
    const ranked = rankSupplyCandidates([c('LOJA', 'l1', 999), c('CD', 'cd1', 18)], 20);
    // l1 cobre (999>=20) e CD não cobre -> Loja primeiro apesar da prioridade do CD
    expect(ranked[0].candidate.branch_id).toBe('l1');
  });

  it('ninguém cobre: recomenda o maior parcial sinalizado como parcial', () => {
    const ranked = rankSupplyCandidates([c('LOJA', 'l1', 3), c('CD', 'cd1', 7)], 20);
    expect(ranked[0].candidate.branch_id).toBe('cd1');
    expect(ranked[0].covers).toBe(false);
    expect(ranked[0].reason).toMatch(/NÃO cobre/);
  });

  it('saldo zero nunca é recomendado', () => {
    const ranked = rankSupplyCandidates([c('CD', 'cd1', 0), c('LOJA', 'l1', 0)], 5);
    expect(ranked.every((r) => !r.recommended)).toBe(true);
  });

  it('fábrica recomendada avisa que pode exigir produção', () => {
    const ranked = rankSupplyCandidates([c('FABRICA', 'f1', 50)], 10);
    expect(ranked[0].recommended).toBe(true);
    expect(ranked[0].reason).toMatch(/Fábrica/);
  });
});
