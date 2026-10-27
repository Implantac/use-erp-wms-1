import { describe, expect, it } from 'vitest';
import { computeCompletionReadiness, demandIdempotencyKey } from './completionReadiness';

const base = {
  orderStatus: 'finishing',
  plannedQuantity: 100,
  steps: [{ status: 'completed' }, { status: 'completed' }],
  inspections: [{ status: 'approved', approved_quantity: 100 }],
  bomLineCount: 2,
};

describe('computeCompletionReadiness', () => {
  it('tudo certo → pronto para concluir e entrar em estoque', () => {
    const r = computeCompletionReadiness(base);
    expect(r.ready).toBe(true);
    expect(r.approvedQuantity).toBe(100);
  });

  it('OP planejada não está pronta e a dica manda iniciar a etapa', () => {
    const r = computeCompletionReadiness({ ...base, orderStatus: 'planned', steps: [{ status: 'pending' }] });
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === 'status')?.hint).toMatch(/Inicie a primeira etapa/);
  });

  it('qualidade parcial não libera (aprovado < planejado)', () => {
    const r = computeCompletionReadiness({ ...base, inspections: [{ status: 'approved', approved_quantity: 40 }] });
    expect(r.items.find((i) => i.key === 'quality')?.ok).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('inspeção rejeitada bloqueia mesmo com aprovação suficiente', () => {
    const r = computeCompletionReadiness({
      ...base,
      inspections: [
        { status: 'approved', approved_quantity: 100 },
        { status: 'rejected', approved_quantity: 0 },
      ],
    });
    expect(r.items.find((i) => i.key === 'quality')?.ok).toBe(false);
  });

  it('sem BOM e sem etapas → não pronto', () => {
    const r = computeCompletionReadiness({ ...base, steps: [], bomLineCount: 0 });
    expect(r.items.filter((i) => !i.ok).map((i) => i.key)).toEqual(expect.arrayContaining(['steps', 'bom']));
  });
});

describe('demandIdempotencyKey', () => {
  it('é estável e dentro dos limites da RPC (8–120)', () => {
    const key = demandIdempotencyKey('12345678-aaaa-bbbb-cccc-dddddddddddd', '87654321-aaaa-bbbb-cccc-dddddddddddd');
    expect(key).toBe('demanda-12345678-87654321');
    expect(key).toBe(demandIdempotencyKey('12345678-xxxx', '87654321-yyyy'));
    expect(key.length).toBeGreaterThanOrEqual(8);
  });
});
