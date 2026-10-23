import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Jornada executável do PCP de tecelagem contra um Supabase já migrado.
 *
 * Este teste não cria massa artificial no banco operacional: ele exige uma
 * empresa de homologação com artigo, BOM/roteiro ativos e lote liberado.
 * Sem as variáveis abaixo ele é ignorado explicitamente; com as variáveis,
 * qualquer divergência de saldo, genealogia, reserva ou status falha o teste.
 */
declare const process: { env: Record<string, string | undefined> };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_WEAVING_EMAIL;
const password = process.env.E2E_WEAVING_PASSWORD;
const productId = process.env.E2E_WEAVING_PRODUCT_ID;
const componentId = process.env.E2E_WEAVING_COMPONENT_ID;
const lotId = process.env.E2E_WEAVING_LOT_ID;

const configured = Boolean(supabaseUrl && anonKey && email && password && productId && componentId && lotId);

function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} é obrigatório para a jornada E2E de tecelagem`);
  return value;
}

async function authenticatedClient(): Promise<SupabaseClient> {
  const client = createClient(required('VITE_SUPABASE_URL', supabaseUrl), required('VITE_SUPABASE_PUBLISHABLE_KEY', anonKey), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: required('E2E_WEAVING_EMAIL', email),
    password: required('E2E_WEAVING_PASSWORD', password),
  });
  expect(error).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

test.describe('PCP Têxtil — Tecelagem (efeitos persistidos)', () => {
  test.skip(!configured, 'Configure VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, E2E_WEAVING_EMAIL/PASSWORD e E2E_WEAVING_PRODUCT_ID/COMPONENT_ID/LOT_ID em ambiente migrado de homologação.');

  test('cria OP com snapshot, reserva lote, agenda sem dupla alocação, aponta etapas, aprova qualidade e conclui com genealogia idempotente', async () => {
    const client = await authenticatedClient();
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const quantity = 10;
    const workCenter = `E2E-TEAR-${runId}`;

    const created = await client.rpc('create_textile_production_order', {
      p_product_id: required('E2E_WEAVING_PRODUCT_ID', productId),
      p_quantity: quantity,
      p_idempotency_key: `e2e-weaving-op-${runId}`,
      p_priority: 'medium',
      p_work_center: workCenter,
      p_weaving_profile: { work_center: workCenter },
    });
    expect(created.error, created.error?.message).toBeNull();
    const orderId = String((created.data as { production_order_id?: string; order_id?: string }).production_order_id ?? (created.data as { order_id?: string }).order_id ?? '');
    expect(orderId).toBeTruthy();

    const { data: order, error: orderError } = await client
      .from('production_orders')
      .select('id, status, quantity, produced_quantity, technical_snapshot, technical_snapshot_at')
      .eq('id', orderId)
      .single();
    expect(orderError).toBeNull();
    expect(order?.technical_snapshot_at).toBeTruthy();
    const bom = (order?.technical_snapshot as { bom?: Array<{ component_id: string; quantity: number; waste_percentage?: number }> } | null)?.bom ?? [];
    const bomLine = bom.find((line) => line.component_id === componentId);
    expect(bomLine, 'snapshot da OP deve conter o componente da fixture').toBeTruthy();
    const expectedConsumption = quantity * Number(bomLine?.quantity ?? 0) * (1 + Number(bomLine?.waste_percentage ?? 0) / 100);
    expect(expectedConsumption).toBeGreaterThan(0);

    const reservation = await client.rpc('reserve_production_materials', {
      p_production_order_id: orderId,
      p_allocations: [{ component_id: componentId, lot_id: lotId, quantity: expectedConsumption }],
      p_idempotency_key: `e2e-weaving-reserve-${runId}`,
    });
    expect(reservation.error, reservation.error?.message).toBeNull();

    const plannedStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const plannedEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const scheduled = await client.rpc('schedule_production_order', {
      p_production_order_id: orderId,
      p_planned_start: plannedStart,
      p_planned_end: plannedEnd,
      p_idempotency_key: `e2e-weaving-schedule-${runId}`,
      p_work_center: workCenter,
      p_sector: 'Tecelagem',
      p_shift: 'diurno',
    });
    expect(scheduled.error, scheduled.error?.message).toBeNull();
    const overlapping = await client.rpc('schedule_production_order', {
      p_production_order_id: orderId,
      p_planned_start: plannedStart,
      p_planned_end: plannedEnd,
      p_idempotency_key: `e2e-weaving-schedule-overlap-${runId}`,
      p_work_center: workCenter,
      p_sector: 'Tecelagem',
      p_shift: 'diurno',
    });
    expect(overlapping.error, 'segunda janela sobreposta no mesmo tear deve ser rejeitada').not.toBeNull();

    const { data: steps, error: stepsError } = await client
      .from('production_order_steps')
      .select('id, sequence, quantity_pending, status')
      .eq('production_order_id', orderId)
      .order('sequence');
    expect(stepsError).toBeNull();
    expect(steps?.length, 'roteiro da fixture deve gerar etapas').toBeGreaterThan(0);
    for (const step of steps ?? []) {
      const { data: currentStep } = await client
        .from('production_order_steps')
        .select('quantity_pending, status')
        .eq('id', step.id)
        .single();
      if (currentStep?.status === 'completed') continue;
      const progress = await client.rpc('record_production_step_progress', {
        p_production_order_step_id: step.id,
        p_action: 'progress',
        p_produced_quantity: Number(currentStep?.quantity_pending ?? quantity),
        p_rejected_quantity: 0,
        p_operator_name: 'E2E Tecelagem',
        p_work_center: workCenter,
      });
      expect(progress.error, progress.error?.message).toBeNull();
    }

    const { data: profile } = await client.from('profiles').select('company_id').single();
    expect(profile?.company_id).toBeTruthy();
    const inspection = await client.from('quality_inspections').insert({
      company_id: profile?.company_id,
      production_order_id: orderId,
      inspector: 'E2E Qualidade',
      approved_quantity: quantity,
      rejected_quantity: 0,
      severity: 'minor',
      status: 'open',
    }).select('id').single();
    expect(inspection.error, inspection.error?.message).toBeNull();
    const decision = await client.rpc('decide_production_quality_inspection', {
      p_inspection_id: inspection.data?.id,
      p_status: 'approved',
      p_corrective_action: null,
      p_notes: 'Aprovação E2E de homologação',
    });
    expect(decision.error, decision.error?.message).toBeNull();

    const completionKey = `e2e-weaving-complete-${runId}`;
    const completionArgs = {
      p_production_order_id: orderId,
      p_idempotency_key: completionKey,
      p_produced_quantity: quantity,
      p_rejected_quantity: 0,
      p_input_allocations: [{ component_id: componentId, lot_id: lotId, quantity: expectedConsumption }],
      p_output_lot_number: `E2E-TECIDO-${runId}`,
    };
    const completed = await client.rpc('complete_production_order', completionArgs);
    expect(completed.error, completed.error?.message).toBeNull();

    const { data: completedOrder } = await client
      .from('production_orders')
      .select('status, produced_quantity')
      .eq('id', orderId)
      .single();
    expect(completedOrder?.status).toBe('completed');
    expect(Number(completedOrder?.produced_quantity)).toBe(quantity);

    const genealogyBefore = await client
      .from('production_lot_genealogy')
      .select('id', { count: 'exact', head: true })
      .eq('production_order_id', orderId);
    expect(genealogyBefore.error).toBeNull();
    expect(genealogyBefore.count).toBeGreaterThan(0);

    const { data: reservations } = await client
      .from('production_material_reservations')
      .select('status, consumed_qty')
      .eq('production_order_id', orderId);
    expect(reservations?.some((row) => Number(row.consumed_qty) > 0)).toBe(true);

    const replay = await client.rpc('complete_production_order', completionArgs);
    expect(replay.error, replay.error?.message).toBeNull();
    const genealogyAfter = await client
      .from('production_lot_genealogy')
      .select('id', { count: 'exact', head: true })
      .eq('production_order_id', orderId);
    expect(genealogyAfter.count).toBe(genealogyBefore.count);

    await client.auth.signOut();
  });
});
