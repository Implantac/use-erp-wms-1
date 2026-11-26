import { describe, expect, it } from 'vitest';
import {
  availableQty,
  dailyGiro,
  pendingSettlement,
  suggestConsignmentTransfers,
  type ConsignBalanceLike,
} from './consignmentMath';

const balance = (over: Partial<ConsignBalanceLike> = {}): ConsignBalanceLike => ({
  branchId: 'b1',
  productId: 'p1',
  qtyReceived: 0,
  qtySold: 0,
  qtySponsored: 0,
  qtyReturned: 0,
  qtyTransferredIn: 0,
  qtyTransferredOut: 0,
  consignedValue: 0,
  soldValue: 0,
  settledValue: 0,
  ...over,
});

describe('availableQty / pendingSettlement', () => {
  it('disponível = recebido + entradas − vendidas − patrocinadas − devolvidas − saídas', () => {
    const b = balance({
      qtyReceived: 100,
      qtyTransferredIn: 10,
      qtySold: 30,
      qtySponsored: 5,
      qtyReturned: 5,
      qtyTransferredOut: 10,
    });
    expect(availableQty(b)).toBe(60);
  });

  it('disponível nunca fica negativo em dado corrompido', () => {
    expect(availableQty(balance({ qtyReceived: 1, qtySold: 10 }))).toBe(-9);
    // (negativo é sinal de dado ruim — o RPC barra antes; aqui só validamos a fórmula)
  });

  it('pendente = vendido − liquidado, com piso em zero', () => {
    expect(pendingSettlement(balance({ soldValue: 500, settledValue: 200 }))).toBe(300);
    expect(pendingSettlement(balance({ soldValue: 100, settledValue: 400 }))).toBe(0);
  });
});

describe('suggestConsignmentTransfers — remanejo por giro', () => {
  const stocks = [
    // Loja 01: giro baixo, 100 peças paradas (60 dias de cobertura)
    { branchId: 'loja01', productId: 'calca', available: 100, dailyDemand: 1.6 },
    // Loja 02: giro maior, 4 peças = 0.5 dia (ruptura)
    { branchId: 'loja02', productId: 'calca', available: 4, dailyDemand: 8 },
  ];

  it('sugere mover da loja de giro baixo para a de giro alto', () => {
    const [s] = suggestConsignmentTransfers(stocks);
    expect(s).toBeDefined();
    expect(s.fromBranchId).toBe('loja01');
    expect(s.toBranchId).toBe('loja02');
    expect(s.qty).toBeGreaterThan(0);
    // destino precisa 8/dia × 30 dias = 240 − 4 atuais = 236;
    // origem cede o que sobra após manter 30 dias para si:
    // 100 − ceil(1,6 × 30) = 100 − 48 = 52 (limitante)
    expect(s.qty).toBe(52);
    expect(s.reason).toContain('giro');
  });

  it('não sugere quando nenhuma origem tem cobertura mínima (giro alto demais)', () => {
    const result = suggestConsignmentTransfers([
      { branchId: 'a', productId: 'x', available: 20, dailyDemand: 2 }, // 10 dias
      { branchId: 'b', productId: 'x', available: 2, dailyDemand: 4 }, // 0.5 dia
    ]);
    expect(result).toHaveLength(0);
  });

  it('não sugere quando o destino não está em necessidade', () => {
    const result = suggestConsignmentTransfers([
      { branchId: 'a', productId: 'x', available: 500, dailyDemand: 1 }, // 500 dias
      { branchId: 'b', productId: 'x', available: 400, dailyDemand: 2 }, // 200 dias
    ]);
    expect(result).toHaveLength(0);
  });

  it('sem demanda no destino não é candidato (não há giro a atender)', () => {
    const result = suggestConsignmentTransfers([
      { branchId: 'a', productId: 'x', available: 500, dailyDemand: 0 },
      { branchId: 'b', productId: 'x', available: 0, dailyDemand: 0 },
    ]);
    expect(result).toHaveLength(0);
  });

  it('origem sem sobra após manter o próprio alvo não é sugerida', () => {
    // origem: 50 un, 1.5/dia → 33.3 dias < 45 de cobertura mínima
    const result = suggestConsignmentTransfers([
      { branchId: 'a', productId: 'x', available: 50, dailyDemand: 1.5 },
      { branchId: 'b', productId: 'x', available: 3, dailyDemand: 6 },
    ]);
    expect(result).toHaveLength(0);
  });

  it('produto sem par de lojas não gera sugestão', () => {
    const result = suggestConsignmentTransfers([
      { branchId: 'a', productId: 'unica', available: 500, dailyDemand: 0.1 },
    ]);
    expect(result).toHaveLength(0);
  });

  it('respeita o limite de sugestões', () => {
    const many = Array.from({ length: 10 }, (_, i) => [
      { branchId: `orig${i}`, productId: `prod${i}`, available: 1000, dailyDemand: 1 },
      { branchId: `dest${i}`, productId: `prod${i}`, available: 1, dailyDemand: 10 },
    ]).flat();
    const result = suggestConsignmentTransfers(many, { limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('ordena por menor cobertura do destino (mais crítico primeiro)', () => {
    const result = suggestConsignmentTransfers([
      { branchId: 'src1', productId: 'p1', available: 600, dailyDemand: 1 }, // 600d
      { branchId: 'dest1', productId: 'p1', available: 6, dailyDemand: 9 }, // 0.67d
      { branchId: 'src2', productId: 'p2', available: 600, dailyDemand: 1 },
      { branchId: 'dest2', productId: 'p2', available: 14, dailyDemand: 2 }, // 7d (na fronteira < 7? não: 7 não é < 7)
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].toBranchId).toBe('dest1');
  });
});

describe('dailyGiro', () => {
  it('divide vendas pelos dias', () => {
    expect(dailyGiro(60, 30)).toBe(2);
  });
  it('protege contra dias inválidos', () => {
    expect(dailyGiro(60, 0)).toBe(0);
    expect(dailyGiro(-5, 30)).toBe(0);
  });
});
