import { test, expect } from '@playwright/test';
import { generated, loginAs, required, UUID } from './isolated-helpers';

/**
 * QA-03 — golden path de PRODUCAO/PCP, migrado de `test.fixme` para o ambiente
 * isolado. Tudo e executado por RPCs reais do replay de 504 migrations.
 *
 * Coberto: criacao de OP com roteiro congelado e snapshot tecnico, operacoes
 * da rota, reserva de insumo por lote, inspecao e decisao de qualidade,
 * fail-closed da conclusao e presenca do ledger PROD-* no replay.
 *
 * PENDENCIA FORMAL (QA-03b): complete_production_order() — a transacao que
 * valida consumo por lote, etapas concluidas, qualidade, BOM e genealogia —
 * ainda NAO e exercitada pela suite. O teste prova que o atalho por UPDATE
 * direto e barrado, ou seja, nao ha falso verde: a conclusao continua
 * exigindo a transacao oficial. Ver docs/E2E-Lojas.md.
 */
test.describe('Producao - Golden Path (QA-03, ambiente isolado)', () => {
  test('OP com roteiro, reserva por lote e qualidade aprovada; conclusao exige transacao', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const companyId = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const productId = required('E2E_WEAVING_PRODUCT_ID', env.E2E_WEAVING_PRODUCT_ID);
    const componentId = required('E2E_WEAVING_COMPONENT_ID', env.E2E_WEAVING_COMPONENT_ID);
    const lotId = required('E2E_WEAVING_LOT_ID', env.E2E_WEAVING_LOT_ID);
    const key = 'qa03-pcp-golden-0001';

    const created = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: 10,
      p_idempotency_key: key, p_priority: 'medium',
    });
    expect(created.error, created.error?.message).toBeNull();
    const opId = required('production_order_id',
      (created.data as { production_order_id?: string })?.production_order_id);
    expect(opId).toMatch(UUID);
    expect(String((created.data as { status?: string })?.status)).toBe('planned');
    expect((created.data as { route_id?: string })?.route_id).toMatch(UUID);
    expect(String((created.data as { technical_snapshot_hash?: string })?.technical_snapshot_hash)).toHaveLength(32);

    const replay = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: 10,
      p_idempotency_key: key, p_priority: 'medium',
    });
    expect(replay.error, replay.error?.message).toBeNull();
    expect((replay.data as { idempotent_replay?: boolean })?.idempotent_replay).toBe(true);
    expect(String((replay.data as { production_order_id?: string })?.production_order_id)).toBe(opId);

    const steps = await manager.from('production_order_steps')
      .select('id').eq('production_order_id', opId);
    expect(steps.error, steps.error?.message).toBeNull();
    expect((steps.data ?? []).length, 'o roteiro congelado deve gerar operacoes').toBeGreaterThan(0);

    const reserved = await manager.rpc('reserve_production_materials', {
      p_production_order_id: opId,
      p_allocations: [{ component_id: componentId, lot_id: lotId, quantity: 10 }],
      p_idempotency_key: 'qa03-pcp-reserva-0001',
    });
    expect(reserved.error, reserved.error?.message).toBeNull();
    expect(Number((reserved.data as { reserved_quantity?: number })?.reserved_quantity)).toBe(10);

    const inspection = await manager.from('quality_inspections').insert({
      company_id: companyId, production_order_id: opId, inspector: 'QA-03',
      inspection_date: new Date().toISOString(), approved_quantity: 10,
      rejected_quantity: 0, severity: 'low', notes: 'QA-03 golden path', status: 'open',
    }).select('id, status').single();
    expect(inspection.error, inspection.error?.message).toBeNull();
    const inspectionId = required('id da inspecao', inspection.data?.id);

    const decided = await manager.rpc('decide_production_quality_inspection', {
      p_inspection_id: inspectionId, p_status: 'approved', p_notes: 'QA-03 aprovado',
    });
    expect(decided.error, decided.error?.message).toBeNull();
    expect(String((decided.data as { status?: string })?.status)).toBe('approved');

    const approved = await manager.from('quality_inspections')
      .select('status, approved_quantity').eq('id', inspectionId).single();
    expect(approved.error, approved.error?.message).toBeNull();
    expect(String(approved.data?.status)).toBe('approved');
    expect(Number(approved.data?.approved_quantity)).toBe(10);

    // Fail-closed: nenhum UPDATE direto pode concluir uma OP sem a transacao
    // oficial de consumo por lote + genealogia + qualidade + etapas.
    const shortcut = await manager.from('production_orders')
      .update({ status: 'completed', produced_quantity: 10 })
      .eq('id', opId).select('status');
    expect(shortcut.error, 'o atalho deve ser barrado').not.toBeNull();
    expect(shortcut.error?.message).toContain('complete_production_order');

    const stillOpen = await manager.from('production_orders')
      .select('status').eq('id', opId).single();
    expect(stillOpen.error, stillOpen.error?.message).toBeNull();
    expect(String(stillOpen.data?.status), 'a tentativa negada nao pode concluir a OP')
      .not.toBe('completed');

    // Ledger de producao REAL do replay: os seeds de tecelagem concluem OPs
    // pela transacao oficial e deixam movimentos de consumo com documento PROD-*.
    const ledger = await manager.from('stock_movements')
      .select('id, document_number, type, direction, quantity')
      .ilike('document_number', 'PROD-%').limit(10);
    expect(ledger.error, ledger.error?.message).toBeNull();
    expect((ledger.data ?? []).length,
      'o replay precisa conter consumo de producao contabilizado').toBeGreaterThan(0);
    expect((ledger.data ?? []).some((m) => String(m.type) === 'production_consumption'
      && String(m.direction) === 'out')).toBe(true);
  });
});
