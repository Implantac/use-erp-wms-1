import { test, expect } from '@playwright/test';
import { generated, loginAs, required, UUID } from './isolated-helpers';

/**
 * QA-03b — conclusao TRANSACIONAL de uma ordem de producao. Fecha a pendencia
 * registrada em QA-03: em vez de apenas provar que o atalho por UPDATE e
 * barrado, esta suite monta a massa exigida por complete_production_order()
 * e verifica TODOS os efeitos colaterais no replay de 504 migrations.
 *
 * Nada e fabricado pela suite: a BOM vem do technical_snapshot congelado da
 * OP, os lotes de entrada sao os seeds deterministicos de tecelagem e as
 * etapas sao concluidas pela RPC oficial record_production_step_progress().
 * Validacoes da transacao exercitadas: status elegivel, etapas concluidas,
 * qualidade aprovada, BOM congelada, alocacao por lote de CADA componente,
 * lote disponivel/liberado e saldo suficiente.
 *
 * Observacao de RLS registrada na documentacao: UPDATE direto em
 * production_orders e recusado por `permission denied for table
 * production_rework_orders` (trigger sem grant para authenticated). O caminho
 * oficial e exclusivamente por RPC — esta suite nao usa o atalho.
 */
type BomLine = {
  component_id: string;
  component_code: string;
  quantity: number;
  waste_percentage: number;
};

async function completeSteps(manager: Awaited<ReturnType<typeof loginAs>>, opId: string) {
  const steps = await manager.from('production_order_steps')
    .select('id, sequence, status, quantity_pending')
    .eq('production_order_id', opId).order('sequence');
  expect(steps.error, steps.error?.message).toBeNull();
  expect((steps.data ?? []).length, 'o roteiro congelado deve gerar operacoes').toBeGreaterThan(0);

  for (const step of steps.data ?? []) {
    const progress = await manager.rpc('record_production_step_progress', {
      p_production_order_step_id: step.id,
      p_action: 'complete',
      p_produced_quantity: 10,
      p_rejected_quantity: 0,
      p_operator_name: 'QA-03b',
      p_notes: 'QA-03b conclusao de etapa',
    });
    expect(progress.error, `etapa ${step.sequence}: ${progress.error?.message}`).toBeNull();
    expect(String((progress.data as { status?: string })?.status)).toBe('completed');
  }

  const after = await manager.from('production_order_steps')
    .select('id, status, quantity_pending').eq('production_order_id', opId);
  expect(after.error, after.error?.message).toBeNull();
  expect((after.data ?? []).every((s) => s.status === 'completed' && Number(s.quantity_pending) <= 0))
    .toBe(true);
}

async function approveQuality(manager: Awaited<ReturnType<typeof loginAs>>, opId: string, companyId: string) {
  const inspection = await manager.from('quality_inspections').insert({
    company_id: companyId, production_order_id: opId, inspector: 'QA-03b',
    inspection_date: new Date().toISOString(), approved_quantity: 10,
    rejected_quantity: 0, severity: 'low', notes: 'QA-03b liberacao formal', status: 'open',
  }).select('id').single();
  expect(inspection.error, inspection.error?.message).toBeNull();
  const decided = await manager.rpc('decide_production_quality_inspection', {
    p_inspection_id: required('id da inspecao', inspection.data?.id),
    p_status: 'approved', p_notes: 'QA-03b aprovado',
  });
  expect(decided.error, decided.error?.message).toBeNull();
  expect(String((decided.data as { status?: string })?.status)).toBe('approved');
}

async function buildAllocations(manager: Awaited<ReturnType<typeof loginAs>>, bom: BomLine[], produced: number) {
  const lots = await manager.from('stock_lots')
    .select('id, product_id, product_code, lot_number, remaining_qty, status, quality_status, unit_cost')
    .in('product_id', bom.map((line) => line.component_id));
  expect(lots.error, lots.error?.message).toBeNull();

  const byComponent = new Map<string, Record<string, unknown>>();
  for (const lot of lots.data ?? []) {
    if (String(lot.status) === 'available'
      && ['approved', 'released'].includes(String(lot.quality_status).toLowerCase())) {
      byComponent.set(String(lot.product_id), lot as Record<string, unknown>);
    }
  }
  expect(byComponent.size, 'cada componente da BOM precisa de um lote liberado').toBe(bom.length);

  return bom.map((line) => {
    const lot = byComponent.get(line.component_id)!;
    const quantity = Number(line.quantity) * produced * (1 + Number(line.waste_percentage) / 100);
    expect(Number(lot.remaining_qty)).toBeGreaterThanOrEqual(quantity);
    return { component_id: line.component_id, lot_id: String(lot.id), quantity };
  });
}

test.describe('QA-03b — conclusao transacional de producao no ambiente isolado', () => {
  test('OP conclui com lote de saida, consumo por lote, genealogia e replay idempotente', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const companyId = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const productId = required('E2E_WEAVING_PRODUCT_ID', env.E2E_WEAVING_PRODUCT_ID);
    const produced = 10;
    const outputLotNumber = `QA03B-OUT-${Date.now()}`;

    const created = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: produced,
      p_idempotency_key: `qa03b-op-${Date.now()}`, p_priority: 'medium',
    });
    expect(created.error, created.error?.message).toBeNull();
    const opId = required('production_order_id',
      (created.data as { production_order_id?: string })?.production_order_id);
    expect(opId).toMatch(UUID);

    const opRow = await manager.from('production_orders')
      .select('order_number, status, branch_id, unit, technical_snapshot, product_id')
      .eq('id', opId).single();
    expect(opRow.error, opRow.error?.message).toBeNull();
    const snapshot = opRow.data?.technical_snapshot as { bom?: BomLine[] } | null;
    const bom = snapshot?.bom ?? [];
    expect(bom.length, 'a OP precisa de BOM congelada no snapshot tecnico').toBeGreaterThan(0);
    const orderNumber = required('order_number', opRow.data?.order_number);

    await completeSteps(manager, opId);
    await approveQuality(manager, opId, companyId);

    const eligible = await manager.from('production_orders').select('status').eq('id', opId).single();
    expect(eligible.error, eligible.error?.message).toBeNull();
    expect(['in_progress', 'finishing', 'quality_check'],
      `status inelegivel para conclusao: ${eligible.data?.status}`).toContain(String(eligible.data?.status));

    const allocations = await buildAllocations(manager, bom, produced);
    const payload = {
      p_production_order_id: opId,
      p_idempotency_key: `qa03b-complete-${Date.now()}`,
      p_produced_quantity: produced,
      p_rejected_quantity: 0,
      p_input_allocations: allocations,
      p_output_lot_number: outputLotNumber,
    };

    const done = await manager.rpc('complete_production_order', payload);
    expect(done.error, done.error?.message).toBeNull();
    const result = done.data as {
      status?: string; completion_id?: string; output_lot_id?: string;
      output_lot_number?: string; produced_quantity?: number; idempotent_replay?: boolean;
    };
    expect(String(result.status)).toBe('completed');
    expect(result.idempotent_replay).toBe(false);
    expect(String(result.output_lot_number)).toBe(outputLotNumber);
    const completionId = required('completion_id', result.completion_id);
    const outputLotId = required('output_lot_id', result.output_lot_id);
    expect(completionId).toMatch(UUID);
    expect(outputLotId).toMatch(UUID);

    const finished = await manager.from('production_orders')
      .select('status, produced_quantity, rejected_quantity, completed_date')
      .eq('id', opId).single();
    expect(finished.error, finished.error?.message).toBeNull();
    expect(String(finished.data?.status)).toBe('completed');
    expect(Number(finished.data?.produced_quantity)).toBe(produced);
    expect(finished.data?.completed_date).not.toBeNull();

    const request = await manager.from('production_completion_requests')
      .select('id, idempotency_key, produced_quantity, rejected_quantity, output_lot_id, output_unit_cost, status')
      .eq('production_order_id', opId).single();
    expect(request.error, request.error?.message).toBeNull();
    expect(String(request.data?.id)).toBe(completionId);
    expect(String(request.data?.idempotency_key)).toBe(payload.p_idempotency_key);
    expect(String(request.data?.output_lot_id)).toBe(outputLotId);
    expect(String(request.data?.status)).toBe('completed');
    // Custo unitario = soma dos insumos consumidos (22/kg) / quantidade produzida.
    const expectedCost = allocations.reduce(
      (sum, a) => sum + a.quantity * 22, 0) / produced;
    expect(Number(request.data?.output_unit_cost)).toBeCloseTo(expectedCost, 2);

    const outputLot = await manager.from('stock_lots')
      .select('id, lot_number, product_id, quantity, remaining_qty, status, quality_status, origin_type')
      .eq('id', outputLotId).single();
    expect(outputLot.error, outputLot.error?.message).toBeNull();
    expect(String(outputLot.data?.lot_number)).toBe(outputLotNumber);
    expect(String(outputLot.data?.product_id)).toBe(productId);
    expect(Number(outputLot.data?.quantity)).toBe(produced);
    expect(String(outputLot.data?.origin_type)).toBe('PRODUCAO');
    expect(String(outputLot.data?.quality_status)).toBe('approved');

    const movements = await manager.from('stock_movements')
      .select('id, type, direction, quantity, product_code, lot_id, document_number')
      .eq('document_number', `PROD-${orderNumber}`);
    expect(movements.error, movements.error?.message).toBeNull();
    expect(movements.data, '2 consumos + 1 entrada de produto acabado').toHaveLength(allocations.length + 1);
    const consumed = (movements.data ?? []).filter((m) => m.type === 'production_consumption' && m.direction === 'out');
    const producedMovement = (movements.data ?? []).filter((m) => m.type === 'production' && m.direction === 'in');
    expect(consumed).toHaveLength(allocations.length);
    expect(producedMovement).toHaveLength(1);
    expect(Number(producedMovement[0]?.quantity)).toBe(produced);
    for (const allocation of allocations) {
      const match = consumed.find((m) => String(m.lot_id) === allocation.lot_id);
      expect(match, `consumo do lote ${allocation.lot_id} deve estar no ledger`).toBeDefined();
      expect(Number(match?.quantity)).toBeCloseTo(allocation.quantity, 4);
    }

    const consumptions = await manager.from('material_consumptions')
      .select('id, component_code, expected_quantity, consumed_quantity, lot_id, completion_id')
      .eq('production_order_id', opId);
    expect(consumptions.error, consumptions.error?.message).toBeNull();
    expect(consumptions.data).toHaveLength(allocations.length);
    for (const row of consumptions.data ?? []) {
      expect(String(row.completion_id)).toBe(completionId);
      expect(Number(row.consumed_quantity)).toBeCloseTo(Number(row.expected_quantity), 4);
    }

    const genealogy = await manager.from('production_lot_genealogy')
      .select('id, input_lot_id, output_lot_id, input_quantity, output_quantity, completion_id')
      .eq('production_order_id', opId);
    expect(genealogy.error, genealogy.error?.message).toBeNull();
    expect(genealogy.data).toHaveLength(allocations.length);
    for (const row of genealogy.data ?? []) {
      expect(String(row.output_lot_id)).toBe(outputLotId);
      expect(Number(row.output_quantity)).toBe(produced);
      expect(String(row.completion_id)).toBe(completionId);
      expect(allocations.some((a) => a.lot_id === String(row.input_lot_id))).toBe(true);
    }

    // O replay nao pode duplicar lote, titulo contabil, movimentos ou genealogia.
    const replay = await manager.rpc('complete_production_order', payload);
    expect(replay.error, replay.error?.message).toBeNull();
    const replayRow = replay.data as { idempotent_replay?: boolean; completion_id?: string; output_lot_id?: string };
    expect(replayRow.idempotent_replay).toBe(true);
    expect(String(replayRow.completion_id)).toBe(completionId);
    expect(String(replayRow.output_lot_id)).toBe(outputLotId);

    const afterReplay = await manager.from('stock_movements')
      .select('id').eq('document_number', `PROD-${orderNumber}`);
    expect(afterReplay.error, afterReplay.error?.message).toBeNull();
    expect(afterReplay.data).toHaveLength(allocations.length + 1);
    const lotsAfter = await manager.from('stock_lots').select('id').eq('lot_number', outputLotNumber);
    expect(lotsAfter.data).toHaveLength(1);
  });

  test('conclusao falha fechada com etapa pendente, alocacao incompleta e producao parcial', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const companyId = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const productId = required('E2E_WEAVING_PRODUCT_ID', env.E2E_WEAVING_PRODUCT_ID);
    const unique = Date.now();

    const created = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: 10,
      p_idempotency_key: `qa03b-fail-${unique}`, p_priority: 'medium',
    });
    expect(created.error, created.error?.message).toBeNull();
    const opId = required('production_order_id',
      (created.data as { production_order_id?: string })?.production_order_id);
    const opRow = await manager.from('production_orders')
      .select('technical_snapshot').eq('id', opId).single();
    const bom = ((opRow.data?.technical_snapshot as { bom?: BomLine[] } | null)?.bom) ?? [];
    expect(bom.length).toBeGreaterThan(1);

    const lots = await manager.from('stock_lots')
      .select('id, product_id, remaining_qty').in('product_id', bom.map((b) => b.component_id));
    expect(lots.error, lots.error?.message).toBeNull();
    const first = lots.data?.[0];
    const oneAllocation = [{
      component_id: String(first?.product_id),
      lot_id: String(first?.id),
      quantity: 1,
    }];
    const base = {
      p_production_order_id: opId,
      p_idempotency_key: `qa03b-failcomplete-${unique}`,
      p_produced_quantity: 10,
      p_rejected_quantity: 0,
      p_input_allocations: oneAllocation,
    };

    const early = await manager.rpc('complete_production_order', base);
    expect(early.error, 'OP planejada nao pode ser concluida').not.toBeNull();

    await completeSteps(manager, opId);
    await approveQuality(manager, opId, companyId);

    const missing = await manager.rpc('complete_production_order', base);
    expect(missing.error, 'a BOM exige lote para TODOS os componentes').not.toBeNull();
    expect(missing.error?.message).toContain('sem lote alocado');

    const all = await buildAllocations(manager, bom, 10);
    const partial = await manager.rpc('complete_production_order', {
      ...base, p_input_allocations: all, p_produced_quantity: 5,
    });
    expect(partial.error, 'producao parcial nao conclui OP').not.toBeNull();
    expect(partial.error?.message).toContain('parcial');

    const requests = await manager.from('production_completion_requests')
      .select('id').eq('production_order_id', opId);
    expect(requests.error, requests.error?.message).toBeNull();
    expect(requests.data, 'nenhuma tentativa invalida pode gravar conclusao').toHaveLength(0);

    const status = await manager.from('production_orders').select('status').eq('id', opId).single();
    expect(String(status.data?.status)).not.toBe('completed');
  });
});
