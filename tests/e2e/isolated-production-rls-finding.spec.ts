import { test, expect } from '@playwright/test';
import { generated, loginAs, required } from './isolated-helpers';

/**
 * QA-05 — congela o ACHADO de RLS encontrado em QA-03b como evidencia
 * reproduzivel, em vez de deixa-lo apenas em prosa.
 *
 * Causa raiz: sync_rework_order_status() e um trigger AFTER UPDATE OF status
 * em production_orders, SECURITY INVOKER, que executa
 *   UPDATE public.production_rework_orders ...
 * incondicionalmente. A migration 20261028200000_rework_orders.sql concede a
 * `authenticated` apenas SELECT nessa tabela (GRANT ALL so para service_role).
 * O PostgreSQL verifica o privilegio antes de procurar linhas, portanto as
 * transicoes de status feitas por um usuario autenticado falham -- mesmo sem
 * existir nenhum registro de retrabalho. As RPCs oficiais funcionam porque sao
 * SECURITY DEFINER e rodam como owner.
 *
 * Ha DUAS barreiras distintas, e a ordem importa: o trigger BEFORE
 * tr_block_unverified_production_completion (intencional) barra 'completed'
 * com a mensagem da transacao oficial; para qualquer OUTRO status o BEFORE
 * deixa passar e o AFTER de rework esbarra no grant ausente (acidental).
 * Nenhuma migration ou grant foi alterada; a decisao de corrigir esta
 * registrada em docs/E2E-Lojas.md.
 */
test.describe('QA-05 — achado de RLS em production_rework_orders', () => {
  test('UPDATE de status falha pelo grant do trigger, mas notes funciona e a RPC oficial muda o status', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const productId = required('E2E_WEAVING_PRODUCT_ID', env.E2E_WEAVING_PRODUCT_ID);

    const created = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: 4,
      p_idempotency_key: `qa05-rls-${Date.now()}`, p_priority: 'medium',
    });
    expect(created.error, created.error?.message).toBeNull();
    const opId = required('production_order_id',
      (created.data as { production_order_id?: string })?.production_order_id);

    // O trigger e AFTER UPDATE OF status: mudar OUTRA coluna nao o dispara.
    // Prova que o problema nao e a tabela production_orders em si.
    const notes = await manager.from('production_orders')
      .update({ notes: 'QA-05 diagnostico de grant' })
      .eq('id', opId).select('notes').single();
    expect(notes.error, notes.error?.message).toBeNull();
    expect(String(notes.data?.notes)).toBe('QA-05 diagnostico de grant');

    // Mudar STATUS dispara o trigger e esbarra no grant ausente.
    const status = await manager.from('production_orders')
      .update({ status: 'in_progress' }).eq('id', opId).select('status');
    expect(status.error, 'o UPDATE direto de status deve ser recusado').not.toBeNull();
    expect(status.error?.message).toContain('production_rework_orders');

    const unchanged = await manager.from('production_orders')
      .select('status').eq('id', opId).single();
    expect(String(unchanged.data?.status), 'a tentativa negada nao pode mudar o status')
      .toBe('planned');

    // O caminho oficial (SECURITY DEFINER) nao sofre o mesmo problema.
    const steps = await manager.from('production_order_steps')
      .select('id, sequence').eq('production_order_id', opId).order('sequence');
    expect(steps.error, steps.error?.message).toBeNull();
    expect((steps.data ?? []).length).toBeGreaterThan(0);
    for (const step of steps.data ?? []) {
      const progress = await manager.rpc('record_production_step_progress', {
        p_production_order_step_id: step.id, p_action: 'complete',
        p_produced_quantity: 4, p_rejected_quantity: 0, p_operator_name: 'QA-05',
      });
      expect(progress.error, `etapa ${step.sequence}: ${progress.error?.message}`).toBeNull();
    }
    const after = await manager.from('production_orders')
      .select('status').eq('id', opId).single();
    expect(after.error, after.error?.message).toBeNull();
    expect(['in_progress', 'finishing', 'quality_check'])
      .toContain(String(after.data?.status));
  });

  test('a barreira intencional de conclusao precede o defeito de grant', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const productId = required('E2E_WEAVING_PRODUCT_ID', env.E2E_WEAVING_PRODUCT_ID);
    const created = await manager.rpc('create_textile_production_order', {
      p_product_id: productId, p_quantity: 2,
      p_idempotency_key: `qa05-rls2-${Date.now()}`, p_priority: 'medium',
    });
    expect(created.error, created.error?.message).toBeNull();
    const opId = required('production_order_id',
      (created.data as { production_order_id?: string })?.production_order_id);

    // 'cancelled' nao e conclusao: o BEFORE deixa passar e o AFTER de
    // retrabalho esbarra no grant ausente (fail-closed ACIDENTAL).
    const cancelled = await manager.from('production_orders')
      .update({ status: 'cancelled' }).eq('id', opId).select('status');
    expect(cancelled.error).not.toBeNull();
    expect(cancelled.error?.message).toContain('production_rework_orders');

    // 'completed' e barrado ANTES pelo trigger BEFORE intencional: a regra
    // de negocio correta prevalece e a mensagem e a da transacao oficial.
    const completed = await manager.from('production_orders')
      .update({ status: 'completed' }).eq('id', opId).select('status');
    expect(completed.error).not.toBeNull();
    expect(completed.error?.message).toContain('complete_production_order');
    expect(completed.error?.message).not.toContain('production_rework_orders');

    const row = await manager.from('production_orders')
      .select('status, completed_date').eq('id', opId).single();
    expect(String(row.data?.status)).toBe('planned');
    expect(row.data?.completed_date).toBeNull();
  });
});
