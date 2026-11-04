import { describe, expect, it } from 'vitest';
import { computeEligibleProductIds } from './eligibleProducts';

const steps = [
  { name: 'Tecelagem em Tear Plano', sector: 'Tecelagem' },
  { name: 'Filatório de Anel', sector: 'Fiação' },
];

function input(overrides: Partial<Parameters<typeof computeEligibleProductIds>[0]> = {}) {
  return {
    products: [
      { id: 'p-tecido', production_route_id: 'r-tecido' },
      { id: 'p-fio', production_route_id: 'r-fio' },
      { id: 'p-sem-bom', production_route_id: 'r-tecido' },
    ],
    bomProductIds: new Set(['p-tecido', 'p-fio']),
    routes: [
      { id: 'r-tecido', product_id: 'p-tecido' },
      { id: 'r-fio', product_id: 'p-fio' },
    ],
    routeSteps: [
      { route_id: 'r-tecido', step_name: 'Tecelagem em Tear Plano' },
      { route_id: 'r-fio', step_name: 'Filatório de Anel' },
    ],
    steps,
    ...overrides,
  };
}

describe('computeEligibleProductIds', () => {
  it('produto de tecelagem só é elegível na tecelagem', () => {
    expect([...computeEligibleProductIds(input(), 'tecelagem')]).toEqual(['p-tecido']);
    expect([...computeEligibleProductIds(input(), 'fiacao')]).toEqual(['p-fio']);
  });

  it('sem BOM o produto não entra, mesmo com roteiro do setor', () => {
    expect(computeEligibleProductIds(input(), 'tecelagem').has('p-sem-bom')).toBe(false);
  });

  it('operação duplicada no catálogo torna o produto inelegível', () => {
    const duplicated = input({ steps: [...steps, { name: 'Tecelagem em Tear Plano', sector: 'Tecelagem' }] });
    expect(computeEligibleProductIds(duplicated, 'tecelagem').size).toBe(0);
  });

  it('sem production_route_id, usa a rota mais recente do produto', () => {
    const noPreferred = input({ products: [{ id: 'p-tecido', production_route_id: null }] });
    expect([...computeEligibleProductIds(noPreferred, 'tecelagem')]).toEqual(['p-tecido']);
  });
});
