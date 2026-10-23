import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261019110000_textile_weaving_pcp_execution.sql', import.meta.url),
  'utf8',
);
const materialConsumption = readFileSync(
  new URL('../src/modules/production/MaterialConsumption.tsx', import.meta.url),
  'utf8',
);
const mrpPage = readFileSync(new URL('../src/modules/production/MRPPage.tsx', import.meta.url), 'utf8');
const scheduleHook = readFileSync(new URL('../src/hooks/production/useProductionSchedule.ts', import.meta.url), 'utf8');
const operatorTerminal = readFileSync(new URL('../src/modules/production/OperatorTerminal.tsx', import.meta.url), 'utf8');
const textileService = readFileSync(new URL('../src/services/production/textilePcpService.ts', import.meta.url), 'utf8');
const productionQueue = readFileSync(new URL('../src/modules/production/ProductionQueue.tsx', import.meta.url), 'utf8');

test('weaving PCP migration exposes the transactional execution contract', () => {
  for (const fn of [
    'create_textile_production_order',
    'reserve_production_materials',
    'release_production_material_reservation',
    'schedule_production_order',
    'cancel_production_schedule',
    'record_production_step_progress',
    'upsert_weaving_order_profile',
    'record_weaving_event',
    'decide_production_quality_inspection',
    'generate_mrp_purchase_order',
    'complete_production_order',
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${fn}\\b`));
  }
  assert.match(migration, /technical_snapshot/);
  assert.match(migration, /production_material_reservations/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /pcp_order_bom_lines/);
  assert.match(migration, /reservas da própria OP|production_material_reservations/);
});

test('programação e acompanhamento visíveis ao gerente de produção', () => {
  const stepsHook = readFileSync(new URL('../src/hooks/production/useProductionSteps.ts', import.meta.url), 'utf8');
  const stepsPage = readFileSync(new URL('../src/modules/production/ProductionSteps.tsx', import.meta.url), 'utf8');
  const queue = readFileSync(new URL('../src/modules/production/ProductionQueue.tsx', import.meta.url), 'utf8');
  // Gerar etapas duas vezes duplicaria o acompanhamento: o hook recusa e a tela só fecha em sucesso.
  assert.match(stepsHook, /existingCount/);
  assert.match(stepsHook, /já possui etapas geradas/);
  assert.match(stepsPage, /if \(!await generateStepsForOrder/);
  // A OP não some do acompanhamento ao entrar em finishing/quality_check.
  assert.match(stepsPage, /!\['completed', 'cancelled'\]\.includes\(o\.status\)/);
  assert.match(queue, /'finishing', 'quality_check'/);
  // Reprogramar: só janela ativa bloqueia; janela encerrada/cancelada libera nova agenda.
  const schedulePage = readFileSync(new URL('../src/modules/production/ProductionSchedule.tsx', import.meta.url), 'utf8');
  assert.match(schedulePage, /\['scheduled', 'in_progress'\]\.includes\(s\.status \?\? ''\)/);
});

test('material consumption UI is a read-only ledger view', () => {
  assert.doesNotMatch(materialConsumption, /from\('material_consumptions'\)\.insert/);
  assert.doesNotMatch(materialConsumption, /handleConsume|Registrar Consumo|Consumir<\/Button>/);
  assert.match(materialConsumption, /conclusão transacional/);
});

test('correções de regressão da jornada do gerente (banco)', () => {
  const read = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
  // products.item_kind: DEFAULT legado 'resale' violava o CHECK PT-BR.
  assert.match(read('20261019120000_products_item_kind_default_fix.sql'), /ALTER COLUMN item_kind SET DEFAULT 'revenda'/);
  // stock_balances publicada + available_qty gerada: FULL bloqueava todo UPDATE.
  assert.match(read('20261019130000_stock_balances_replica_identity_fix.sql'), /stock_balances REPLICA IDENTITY DEFAULT/);
  // Trigger de atraso comparava entity_id uuid com NEW.id::text (uuid = text).
  const delayFix = read('20261019140000_production_delay_alert_entity_id_fix.sql');
  const delayBody = delayFix.slice(delayFix.indexOf('CREATE OR REPLACE FUNCTION'));
  assert.match(delayBody, /entity_id = NEW\.id AND alert_type = 'delay'/);
  assert.doesNotMatch(delayBody, /entity_id = NEW\.id::text/);
  // Trigger legado de conclusão automática não pode interferir na RPC transacional.
  assert.match(read('20261019150000_remove_legacy_stock_from_production_trigger.sql'), /DROP TRIGGER IF EXISTS trg_stock_from_production/);
  // Setor da OP vem da primeira operação do roteiro, não fixo 'Tecelagem'.
  const sectorFix = read('20261019160000_textile_order_sector_from_route.sql');
  assert.match(sectorFix, /INTO v_sector/);
  assert.match(sectorFix, /v_sector, p_sales_order_id/);
  // Expedição por lote: reserva grava lot_id, pula quarentena; picking baixa o lote.
  const lotExpedition = read('20261019170000_wms_lot_based_expedition.sql');
  assert.match(lotExpedition, /reserved_at, lot_id/);
  assert.match(lotExpedition, /'blocked','quarantine','rejected'/);
  assert.match(lotExpedition, /r\.lot_id IS NULL OR sb\.lot_id = r\.lot_id/);
  assert.match(lotExpedition, /company_id, lot_id, batch\)/);
});

test('fluxo de teste local executa a cadeia pelas RPCs reais e o seed da BIL nao referencia colunas inexistentes', () => {
  const fluxo = readFileSync(new URL('../docker/local/scripts/seed-fluxo-teste.sql', import.meta.url), 'utf8');
  const seedBil = readFileSync(new URL('../docker/local/scripts/seed-bil.sql', import.meta.url), 'utf8');
  for (const rpc of ['create_textile_production_order', 'reserve_production_materials', 'schedule_production_order',
    'record_production_step_progress', 'decide_production_quality_inspection', 'complete_production_order']) {
    assert.match(fluxo, new RegExp(rpc));
  }
  assert.match(fluxo, /MALHA-TING-LOTE-TESTE-001/);
  assert.match(fluxo, /PV-TESTE-0001/);
  assert.doesNotMatch(seedBil, /is_demo/);
  // psql nao interpola :'var' dentro de blocos $$: valores via current_setting
  assert.match(seedBil, /current_setting\('app\.admin_email'/);
  assert.match(fluxo, /current_setting\('app\.admin_email'/);
  assert.doesNotMatch(fluxo, /lower\(trim\(:'admin_email'\)\);/);
});

test('painel do gerente usa somente dados reais e documenta as fórmulas', () => {
  const panel = readFileSync(new URL('../src/modules/production/pcp/ManagerPanel.tsx', import.meta.url), 'utf8');
  const metrics = readFileSync(new URL('../src/lib/pcp/managerMetrics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(panel + metrics, /Math\.random/);
  assert.match(panel, /Sem dados suficientes/);
  assert.match(metrics, /nunca somamos m com kg/i);
  assert.match(panel, /useProductionOrders/);
  assert.match(panel, /useProductionSchedule/);
  assert.match(panel, /useManagerPanelData/);
  assert.match(panel, /Fórmula:/);
});

test('MRP page uses the net calculation and purchase generation path', () => {
  assert.match(mrpPage, /useNetMRP/);
  assert.match(mrpPage, /Necessidade líquida/);
  assert.doesNotMatch(mrpPage, /Saldo bruto/);
});

test('schedule and terminal write through PCP RPCs, not direct step mutation', () => {
  assert.match(scheduleHook, /scheduleProductionOrder/);
  assert.match(scheduleHook, /cancelProductionSchedule/);
  assert.match(operatorTerminal, /recordProductionStepProgress/);
  assert.doesNotMatch(operatorTerminal, /aguardam conciliação transacional/);
  assert.match(textileService, /p_resource_id: input\.resourceId/);
  assert.match(textileService, /p_machine_id: input\.machineId/);
  assert.doesNotMatch(productionQueue, /update\(op\.id, \{ status: 'in_progress'/);
  assert.match(productionQueue, /to="\/producao\/ordens"/);
});
