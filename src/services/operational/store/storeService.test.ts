import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc, results } = vi.hoisted(() => {
  const results: Record<string, unknown> = {};
  const rpc = vi.fn();
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'gte', 'not', 'order', 'limit', 'single']) {
      q[method] = vi.fn(() => q);
    }
    // Torna o builder aguardavel, como o PostgrestBuilder real.
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
    return q;
  });
  return { from, rpc, results };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

import { storeService } from './storeService';

function setResult(table: string, value: unknown) {
  results[table] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(results)) delete results[key];
});

describe('LOJ-08 — confiabilidade de estoque sem numeros inventados', () => {
  it('retorna null quando nao ha divergencias, nunca 99,2', async () => {
    setResult('operational_discrepancies', { data: [], error: null });
    await expect(storeService.getStockReliability('branch-1')).resolves.toBeNull();
  });

  it('propaga erro de consulta/RLS em vez de devolver um numero', async () => {
    setResult('operational_discrepancies', { data: null, error: { message: 'RLS indisponivel' } });
    await expect(storeService.getStockReliability('branch-1')).rejects.toThrow('RLS indisponivel');
  });

  it('retorna null quando o total esperado e zero', async () => {
    setResult('operational_discrepancies', {
      data: [{ expected_qty: 0, actual_qty: 0 }], error: null
    });
    await expect(storeService.getStockReliability('branch-1')).resolves.toBeNull();
  });

  it('calcula a acuracia a partir de linhas reais', async () => {
    setResult('operational_discrepancies', {
      data: [{ expected_qty: 100, actual_qty: 95 }], error: null
    });
    await expect(storeService.getStockReliability('branch-1')).resolves.toBe(95);
  });

  it('ignora linhas nao numericas e retorna null quando nenhuma e valida', async () => {
    setResult('operational_discrepancies', {
      data: [{ expected_qty: null, actual_qty: 'x' }], error: null
    });
    await expect(storeService.getStockReliability('branch-1')).resolves.toBeNull();
  });
});

describe('LOJ-08 — saude da loja sem ranking artificial', () => {
  it('fica indisponivel quando nao ha base de inventario', async () => {
    setResult('operational_discrepancies', { data: [], error: null });
    setResult('operational_tasks', { count: 0, error: null });

    const health = await storeService.getStoreHealth('branch-1');

    expect(health.score).toBeNull();
    expect(health.status).toBe('unavailable');
    expect(health.networkPosition).toBeNull();
    expect(health.unavailableReason).toBeTruthy();
    expect(health.factors.find((f) => f.label === 'Confiabilidade de Estoque')?.score).toBeNull();
    expect(health.factors.map((f) => f.label)).not.toContain('Ranking Eficiência');
    expect(health.factors.map((f) => f.label)).not.toContain('Rede Operacional');
  });

  it('propaga erro na contagem de excecoes em vez de transforma-lo em zero', async () => {
    setResult('operational_discrepancies', {
      data: [{ expected_qty: 100, actual_qty: 100 }], error: null
    });
    setResult('operational_tasks', { count: null, error: { message: 'contagem falhou' } });

    await expect(storeService.getStoreHealth('branch-1')).rejects.toThrow('contagem falhou');
  });

  it('aplica a formula declarada e nao ranqueia por posicao na lista', async () => {
    setResult('operational_discrepancies', {
      data: [{ expected_qty: 100, actual_qty: 95 }], error: null
    });
    setResult('operational_tasks', { count: 2, error: null });

    const health = await storeService.getStoreHealth('branch-1');

    expect(health.score).toBe(85); // 95 de acuracia - 5 por excecao x 2
    expect(health.status).toBe('attention');
    expect(health.networkPosition).toBeNull();
    expect(health.factors).toHaveLength(2);
    expect(health.factors[0].score).toBe(95);
    expect(health.factors[1].score).toBe(96); // 100 - 2 excecoes x 2
  });
});

describe('LOJ-08 — KPIs e alertas falham fechado', () => {
  it('nao apresenta zero caixas abertos como se fosse dado', async () => {
    const kpis = await storeService.getStoreKPIs('branch-1');
    expect(kpis.openCashiers).toBeNull();
    expect(kpis.sales).toBe(0);
  });

  it('propaga erro de consulta dos KPIs', async () => {
    setResult('operational_tasks', { data: null, error: { message: 'falha tasks' } });
    await expect(storeService.getStoreKPIs('branch-1')).rejects.toThrow('falha tasks');
  });

  it('propaga erro de consulta dos alertas em vez de devolver lista vazia', async () => {
    setResult('operational_tasks', { data: null, error: { message: 'falha alertas' } });
    await expect(storeService.getOperationalAlerts('branch-1')).rejects.toThrow('falha alertas');
  });
});
