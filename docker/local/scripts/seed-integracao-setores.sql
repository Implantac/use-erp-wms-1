-- ============================================================================
-- USE ERP (local) — TESTE INTEGRADO DOS 4 SETORES (fiação -> tecelagem e
-- malharia -> tinturaria) na empresa BIL, como numa indústria integrada.
--
-- Uma única cadeia produtiva atravessa as quatro centrais de PCP:
--   PLUMA-INT -> FIO-INT-30 -> TECIDO-INT-01 (tecelagem plana)
--                           -> MALHA-INT-30 -> MALHA-INT-TING-30 (tinturaria)
-- Cada OP nasce na sua central (setor vem do roteiro), com perfil técnico
-- do setor, eventos classificados por desvio, programação finita, qualidade
-- aprovada e conclusão transacional com genealogia lote-a-lote ENTRE
-- setores. Tudo pelas RPCs oficiais; nenhum dado é inserido por fora.
--
-- Consumos e parâmetros abaixo são a FICHA DE TESTE desta demonstração,
-- não constantes do sistema. Idempotente: marcador MALHA-INT-TING-LOTE-001.
-- Pré-requisitos: migrations aplicadas e BIL cadastrada.
-- Uso (psql): -v admin_email='etcsuporte889@gmail.com' -f seed-integracao-setores.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?admin_email}
\else
  \set admin_email etcsuporte889@gmail.com
\endif

SELECT set_config('app.admin_email', :'admin_email', false);

BEGIN;

DO $$
DECLARE
  v_admin_email text := lower(trim(current_setting('app.admin_email', true)));
  v_user_id uuid;
  v_company_id uuid;
  v_branch_id uuid;

  P_PLUMA constant uuid := 'e5000000-0000-4000-8000-000000000010';
  P_FIO   constant uuid := 'e5000000-0000-4000-8000-000000000011';
  P_TEC   constant uuid := 'e5000000-0000-4000-8000-000000000012';
  P_MAL   constant uuid := 'e5000000-0000-4000-8000-000000000013';
  P_TING  constant uuid := 'e5000000-0000-4000-8000-000000000014';
  P_COR   constant uuid := 'e5000000-0000-4000-8000-000000000015';
  L_PLUMA constant uuid := 'e5000000-0000-4000-8000-000000000020';
  L_COR   constant uuid := 'e5000000-0000-4000-8000-000000000021';
  M_FIL   constant uuid := 'e5000000-0000-4000-8000-000000000030';
  M_TEAR  constant uuid := 'e5000000-0000-4000-8000-000000000031';
  M_CIRC  constant uuid := 'e5000000-0000-4000-8000-000000000032';
  M_JET   constant uuid := 'e5000000-0000-4000-8000-000000000033';

  v_pluma uuid; v_fio uuid; v_tec uuid; v_mal uuid; v_ting uuid; v_cor uuid;
  v_lote_pluma uuid; v_lote_cor uuid; v_lote_fio uuid; v_lote_mal uuid;
  v_fil uuid; v_tear uuid; v_circ uuid; v_jet uuid;
  v_rota uuid;
  v_r jsonb;
  v_op1 uuid; v_op2 uuid; v_op3 uuid; v_op4 uuid;
  v_step record;
  v_insp uuid;
BEGIN
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
   ORDER BY created_at LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa BIL nao encontrada: rode antes o cadastro da BIL (CORRIGIR-LOGIN-BIL.bat).';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_admin_email ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Administrador % nao encontrado: rode antes o cadastro da BIL.', v_admin_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_lots
              WHERE company_id = v_company_id AND lot_number = 'MALHA-INT-TING-LOTE-001') THEN
    RAISE NOTICE 'INTEGRACAO_JA_PREPARADA: a cadeia integrada dos 4 setores ja existe; nada foi alterado.';
    RETURN;
  END IF;

  v_branch_id := COALESCE(
    (SELECT branch_id FROM public.profiles WHERE id = v_user_id),
    (SELECT id FROM public.branches WHERE company_id = v_company_id AND is_headquarters ORDER BY created_at LIMIT 1));

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated', 'email', v_admin_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('app.allow_tenant_link', 'on', true);
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Artigos da cadeia integrada
  INSERT INTO public.products (id, company_id, code, name, type, unit, item_kind) VALUES
    (P_PLUMA, v_company_id, 'PLUMA-INT',       'Algodão em pluma (integração)',  'raw_material', 'kg', 'insumo'),
    (P_FIO,   v_company_id, 'FIO-INT-30',      'Fio 30/1 cardado (integração)',  'raw_material', 'kg', 'insumo'),
    (P_TEC,   v_company_id, 'TECIDO-INT-01',   'Tecido plano cru (integração)',  'finished',     'm',  'acabado'),
    (P_MAL,   v_company_id, 'MALHA-INT-30',    'Malha crua (integração)',        'raw_material', 'kg', 'insumo'),
    (P_TING,  v_company_id, 'MALHA-INT-TING-30','Malha tingida (integração)',    'finished',     'kg', 'acabado'),
    (P_COR,   v_company_id, 'CORANTE-INT-AZUL','Corante reativo azul (int.)',    'raw_material', 'kg', 'insumo')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_pluma FROM public.products WHERE company_id = v_company_id AND code = 'PLUMA-INT';
  SELECT id INTO v_fio   FROM public.products WHERE company_id = v_company_id AND code = 'FIO-INT-30';
  SELECT id INTO v_tec   FROM public.products WHERE company_id = v_company_id AND code = 'TECIDO-INT-01';
  SELECT id INTO v_mal   FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-INT-30';
  SELECT id INTO v_ting  FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-INT-TING-30';
  SELECT id INTO v_cor   FROM public.products WHERE company_id = v_company_id AND code = 'CORANTE-INT-AZUL';

  -- Operações por setor (o setor da OP vem do roteiro)
  INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector) VALUES
    (v_company_id, 'Abertura e Cardagem (int.)',   'FIA-INT-1', 1, 300, 'Fiação'),
    (v_company_id, 'Filatório de Anel (int.)',     'FIA-INT-2', 2, 600, 'Fiação'),
    (v_company_id, 'Bobinagem/Conicaleira (int.)', 'FIA-INT-3', 3, 240, 'Fiação'),
    (v_company_id, 'Preparação do Urdume (int.)',  'TEC-INT-1', 1, 240, 'Tecelagem'),
    (v_company_id, 'Tecelagem em Tear Plano (int.)','TEC-INT-2', 2, 600, 'Tecelagem'),
    (v_company_id, 'Revisão do Tecido Cru (int.)', 'TEC-INT-3', 3, 60,  'Tecelagem'),
    (v_company_id, 'Tear Circular (int.)',         'MAL-INT-1', 1, 480, 'Malharia'),
    (v_company_id, 'Revisão da Malha Crua (int.)', 'MAL-INT-2', 2, 60,  'Malharia'),
    (v_company_id, 'Preparação e Lavagem (int.)',  'TIN-INT-1', 1, 120, 'Tinturaria'),
    (v_company_id, 'Tingimento em JET (int.)',     'TIN-INT-2', 2, 360, 'Tinturaria'),
    (v_company_id, 'Secagem e Acabamento (int.)',  'TIN-INT-3', 3, 180, 'Tinturaria')
  ON CONFLICT DO NOTHING;

  -- Roteiros por artigo
  INSERT INTO public.production_routes (company_id, code, product_id, is_active) VALUES
    (v_company_id, 'ROT-INT-FIA', v_fio, true),
    (v_company_id, 'ROT-INT-TEC', v_tec, true),
    (v_company_id, 'ROT-INT-MAL', v_mal, true),
    (v_company_id, 'ROT-INT-TIN', v_ting, true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_rota FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-INT-FIA';
  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT v_rota, v_company_id, s, n, t FROM (VALUES
    (1, 'Abertura e Cardagem (int.)', 300), (2, 'Filatório de Anel (int.)', 600), (3, 'Bobinagem/Conicaleira (int.)', 240)
  ) AS x(s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = v_rota AND rs.sequence = x.s);

  SELECT id INTO v_rota FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-INT-TEC';
  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT v_rota, v_company_id, s, n, t FROM (VALUES
    (1, 'Preparação do Urdume (int.)', 240), (2, 'Tecelagem em Tear Plano (int.)', 600), (3, 'Revisão do Tecido Cru (int.)', 60)
  ) AS x(s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = v_rota AND rs.sequence = x.s);

  SELECT id INTO v_rota FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-INT-MAL';
  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT v_rota, v_company_id, s, n, t FROM (VALUES
    (1, 'Tear Circular (int.)', 480), (2, 'Revisão da Malha Crua (int.)', 60)
  ) AS x(s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = v_rota AND rs.sequence = x.s);

  SELECT id INTO v_rota FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-INT-TIN';
  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT v_rota, v_company_id, s, n, t FROM (VALUES
    (1, 'Preparação e Lavagem (int.)', 120), (2, 'Tingimento em JET (int.)', 360), (3, 'Secagem e Acabamento (int.)', 180)
  ) AS x(s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = v_rota AND rs.sequence = x.s);

  -- Fichas (BOM) da cadeia — ficha de teste configurada, não constante
  INSERT INTO public.production_bom (company_id, product_id, component_id, quantity, waste_percentage)
  SELECT v_company_id, p, c, q, 0 FROM (VALUES
    (v_fio,  v_pluma, 1.18),
    (v_tec,  v_fio,   0.215),
    (v_mal,  v_fio,   1.03),
    (v_ting, v_mal,   1.00),
    (v_ting, v_cor,   0.025)
  ) AS x(p, c, q)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_bom b WHERE b.company_id = v_company_id AND b.product_id = x.p AND b.component_id = x.c);

  INSERT INTO public.production_machines (id, code, name, company_id, sector) VALUES
    (M_FIL,  'FIL-INT-01',  'Filatório de Anel (int.)',  v_company_id, 'Fiação'),
    (M_TEAR, 'TEAR-INT-01', 'Tear Plano (int.)',         v_company_id, 'Tecelagem'),
    (M_CIRC, 'CIRC-INT-01', 'Tear Circular (int.)',      v_company_id, 'Malharia'),
    (M_JET,  'JET-INT-01',  'JET de Tingimento (int.)',  v_company_id, 'Tinturaria')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_fil  FROM public.production_machines WHERE company_id = v_company_id AND code = 'FIL-INT-01';
  SELECT id INTO v_tear FROM public.production_machines WHERE company_id = v_company_id AND code = 'TEAR-INT-01';
  SELECT id INTO v_circ FROM public.production_machines WHERE company_id = v_company_id AND code = 'CIRC-INT-01';
  SELECT id INTO v_jet  FROM public.production_machines WHERE company_id = v_company_id AND code = 'JET-INT-01';

  -- Estoque inicial da cadeia: pluma e corante aprovados
  INSERT INTO public.stock_lots (id, company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status, unit_cost) VALUES
    (L_PLUMA, v_company_id, v_pluma, 'PLUMA-INT', 'Algodão em pluma (integração)', 'PLUMA-INT-LOTE-001', 260, 260, 'available', 'approved', 18),
    (L_COR,   v_company_id, v_cor,   'CORANTE-INT-AZUL', 'Corante reativo azul (int.)', 'CORANTE-INT-LOTE-001', 10, 10, 'available', 'approved', 120)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_lote_pluma FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'PLUMA-INT-LOTE-001';
  SELECT id INTO v_lote_cor   FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'CORANTE-INT-LOTE-001';

  INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
  SELECT v_company_id, l.product_id, l.id, v_branch_id, 'ATACADO_INDUSTRIA', l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
   WHERE l.id IN (v_lote_pluma, v_lote_cor)
     AND NOT EXISTS (SELECT 1 FROM public.stock_balances b WHERE b.company_id = v_company_id AND b.lot_id = l.id);

  PERFORM set_config('session_replication_role', 'origin', true);

  -- ==================================================================
  -- 1) FIAÇÃO: 200 kg de fio 30/1 a partir de 236 kg de pluma
  -- ==================================================================
  v_r := public.create_textile_production_order(v_fio, 200, 'integracao-op-fiacao', 'high',
    now() + interval '6 days', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb);
  v_op1 := (v_r ->> 'production_order_id')::uuid;

  PERFORM public.upsert_sector_order_profile(v_op1, 'fiacao', jsonb_build_object(
    'machine_id', v_fil, 'work_center', 'Fiação', 'target_title', 'Ne 30/1',
    'twist_per_m', 780, 'planned_output_kg', 200, 'notes', 'Fio cardado para tecelagem e malharia (integração)'));

  PERFORM public.reserve_production_materials(v_op1,
    jsonb_build_array(jsonb_build_object('component_id', v_pluma, 'lot_id', v_lote_pluma, 'quantity', 236)),
    'integracao-reserva-fiacao');
  PERFORM public.schedule_production_order(v_op1, now() + interval '1 hour', now() + interval '21 hours',
    'integracao-prog-fiacao', NULL, v_fil, NULL, NULL, 'diurno');

  FOR v_step IN SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op1 ORDER BY sequence LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      (ARRAY[200, 197, 195])[v_step.sequence], (ARRAY[0, 3, 2])[v_step.sequence], 'Operador Fiação');
  END LOOP;

  PERFORM public.record_sector_event(v_op1, 'fiacao', 'start', NULL, v_fil, NULL, NULL, NULL, NULL, 'Operador Fiação');
  PERFORM public.record_sector_event(v_op1, 'fiacao', 'doffing', NULL, v_fil, NULL, 65, NULL, NULL, 'Operador Fiação');
  PERFORM public.record_sector_event(v_op1, 'fiacao', 'fiber_break', NULL, v_fil, NULL, NULL, 11, 'Ruptura no filatório', 'Operador Fiação', 'material', 'em_investigacao');
  PERFORM public.record_sector_event(v_op1, 'fiacao', 'doffing', NULL, v_fil, NULL, 68, NULL, NULL, 'Operador Fiação');
  PERFORM public.record_sector_event(v_op1, 'fiacao', 'stop', NULL, v_fil, NULL, NULL, NULL, 'Fim do lote de fio', 'Operador Fiação');

  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op1, 'Laboratório de Fios', 195, 5, 'open', 'Título e torção dentro da ficha de teste')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  PERFORM public.complete_production_order(v_op1, 'integracao-conclusao-fiacao', 195, 5,
    jsonb_build_array(jsonb_build_object('component_id', v_pluma, 'lot_id', v_lote_pluma, 'quantity', 236)),
    'FIO-INT-LOTE-001');
  SELECT id INTO v_lote_fio FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'FIO-INT-LOTE-001';

  -- ==================================================================
  -- 2) TECELAGEM PLANA: 400 m de tecido cru com o fio da fiação
  -- ==================================================================
  v_r := public.create_textile_production_order(v_tec, 400, 'integracao-op-tecelagem', 'high',
    now() + interval '8 days', NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object(
      'machine_id', v_tear, 'work_center', 'Tecelagem',
      'warp_product_id', v_fio, 'weft_product_id', v_fio,
      'warp_lot_id', v_lote_fio, 'weft_lot_id', v_lote_fio,
      'beam_code', 'ROLO-INT-001', 'reed_code', 'PENTE-INT-56',
      'picks_per_cm', 20, 'warp_thread_count', 2600,
      'planned_width_cm', 150, 'planned_length_m', 400, 'setup_minutes', 240,
      'notes', 'Tecido cru da cadeia integrada (urdume e trama do mesmo fio)'));
  v_op2 := (v_r ->> 'production_order_id')::uuid;

  PERFORM public.reserve_production_materials(v_op2,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lote_fio, 'quantity', 86)),
    'integracao-reserva-tecelagem');
  PERFORM public.schedule_production_order(v_op2, now() + interval '22 hours', now() + interval '38 hours',
    'integracao-prog-tecelagem', NULL, v_tear, NULL, NULL, 'diurno');

  FOR v_step IN SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op2 ORDER BY sequence LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      (ARRAY[400, 385, 385])[v_step.sequence], (ARRAY[0, 15, 0])[v_step.sequence], 'Operador Tecelagem');
  END LOOP;

  PERFORM public.record_weaving_event(v_op2, 'setup', NULL, v_tear, NULL, NULL, NULL, 'Montagem do rolo ROLO-INT-001', 'Operador Tecelagem', 'preparacao', 'confirmada');
  PERFORM public.record_weaving_event(v_op2, 'start', NULL, v_tear, NULL, NULL, NULL, NULL, 'Operador Tecelagem');
  PERFORM public.record_weaving_event(v_op2, 'warp_break', NULL, v_tear, NULL, NULL, 9, 'Quebra de urdume', 'Operador Tecelagem', 'fio_urdume', 'confirmada');
  PERFORM public.record_weaving_event(v_op2, 'stop', NULL, v_tear, NULL, 385, NULL, 'Fim da metragem', 'Operador Tecelagem');

  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op2, 'Revisão de Tecidos', 385, 15, 'open', '385 m aprovados, 15 m de refugo de revisão')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  PERFORM public.complete_production_order(v_op2, 'integracao-conclusao-tecelagem', 385, 15,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lote_fio, 'quantity', 86)),
    'TECIDO-INT-LOTE-001');

  -- ==================================================================
  -- 3) MALHARIA: 100 kg de malha crua com o mesmo fio
  -- ==================================================================
  v_r := public.create_textile_production_order(v_mal, 100, 'integracao-op-malharia', 'medium',
    now() + interval '8 days', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb);
  v_op3 := (v_r ->> 'production_order_id')::uuid;

  PERFORM public.upsert_sector_order_profile(v_op3, 'malharia', jsonb_build_object(
    'machine_id', v_circ, 'work_center', 'Malharia', 'gauge', 'E28',
    'diameter_cm', 76.2, 'planned_output_kg', 100, 'notes', 'Malha crua para tingimento (integração)'));

  PERFORM public.reserve_production_materials(v_op3,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lote_fio, 'quantity', 103)),
    'integracao-reserva-malharia');
  PERFORM public.schedule_production_order(v_op3, now() + interval '22 hours', now() + interval '32 hours',
    'integracao-prog-malharia', NULL, v_circ, NULL, NULL, 'diurno');

  FOR v_step IN SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op3 ORDER BY sequence LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      (ARRAY[100, 97])[v_step.sequence], (ARRAY[0, 3])[v_step.sequence], 'Operador Malharia');
  END LOOP;

  PERFORM public.record_sector_event(v_op3, 'malharia', 'start', NULL, v_circ, NULL, NULL, NULL, NULL, 'Operador Malharia');
  PERFORM public.record_sector_event(v_op3, 'malharia', 'yarn_break', NULL, v_circ, NULL, NULL, 9, 'Quebra de fio no alimentador', 'Operador Malharia', 'maquina', 'confirmada');
  PERFORM public.record_sector_event(v_op3, 'malharia', 'roll_change', NULL, v_circ, NULL, 48, NULL, NULL, 'Operador Malharia');
  PERFORM public.record_sector_event(v_op3, 'malharia', 'stop', NULL, v_circ, NULL, NULL, NULL, 'Fim do rolo de malha', 'Operador Malharia');

  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op3, 'Revisão de Malhas', 97, 3, 'open', 'Malha crua aprovada para tinturaria')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  PERFORM public.complete_production_order(v_op3, 'integracao-conclusao-malharia', 97, 3,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lote_fio, 'quantity', 103)),
    'MALHA-INT-LOTE-001');
  SELECT id INTO v_lote_mal FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'MALHA-INT-LOTE-001';

  -- ==================================================================
  -- 4) TINTURARIA: tingir a malha crua (cor, banho e Lab da ficha)
  -- ==================================================================
  v_r := public.create_textile_production_order(v_ting, 97, 'integracao-op-tinturaria', 'high',
    now() + interval '10 days', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb);
  v_op4 := (v_r ->> 'production_order_id')::uuid;

  PERFORM public.upsert_sector_order_profile(v_op4, 'tinturaria', jsonb_build_object(
    'machine_id', v_jet, 'work_center', 'Tinturaria', 'color_name', 'Azul Royal',
    'color_code', 'AZ-01', 'bath_ratio', 8, 'batch_code', 'BANHO-INT-001',
    'lab_l', 35, 'lab_a', 5, 'lab_b', -38, 'planned_output_kg', 97,
    'notes', 'Cor aprovada em laboratório (ficha de teste); relação de banho 1:8'));

  PERFORM public.reserve_production_materials(v_op4,
    jsonb_build_array(
      jsonb_build_object('component_id', v_mal, 'lot_id', v_lote_mal, 'quantity', 97),
      jsonb_build_object('component_id', v_cor, 'lot_id', v_lote_cor, 'quantity', 2.425)
    ),
    'integracao-reserva-tinturaria');
  PERFORM public.schedule_production_order(v_op4, now() + interval '40 hours', now() + interval '52 hours',
    'integracao-prog-tinturaria', NULL, v_jet, NULL, NULL, 'diurno');

  FOR v_step IN SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op4 ORDER BY sequence LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      (ARRAY[97, 95, 95])[v_step.sequence], (ARRAY[0, 2, 0])[v_step.sequence], 'Operador Tinturaria');
  END LOOP;

  PERFORM public.record_sector_event(v_op4, 'tinturaria', 'bath_start', NULL, v_jet, NULL, 97, NULL, 'Carga do banho BANHO-INT-001', 'Tintureiro');
  PERFORM public.record_sector_event(v_op4, 'tinturaria', 'color_hold', NULL, v_jet, NULL, NULL, 25, 'Acerto de cor aguardando laboratório', 'Tintureiro', 'laboratorio', 'em_investigacao');
  PERFORM public.record_sector_event(v_op4, 'tinturaria', 'color_release', NULL, v_jet, NULL, NULL, NULL, 'Cor liberada pelo laboratório', 'Tintureiro');
  PERFORM public.record_sector_event(v_op4, 'tinturaria', 'wash', NULL, v_jet, NULL, NULL, NULL, NULL, 'Tintureiro');
  PERFORM public.record_sector_event(v_op4, 'tinturaria', 'unload', NULL, v_jet, NULL, 95, NULL, 'Descarga do lote tingido', 'Tintureiro');

  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op4, 'Laboratório de Cor', 95, 2, 'open', 'Cor dentro do padrão Lab da ficha; 2 kg de segunda')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  PERFORM public.complete_production_order(v_op4, 'integracao-conclusao-tinturaria', 95, 2,
    jsonb_build_array(
      jsonb_build_object('component_id', v_mal, 'lot_id', v_lote_mal, 'quantity', 97),
      jsonb_build_object('component_id', v_cor, 'lot_id', v_lote_cor, 'quantity', 2.425)
    ),
    'MALHA-INT-TING-LOTE-001');

  RAISE NOTICE 'INTEGRACAO_SETORES_OK: pluma -> fio -> tecido/malha -> tingimento concluidos nas 4 centrais.';
END $$;

COMMIT;

-- Conferência: uma linha por setor
SELECT o.sector AS setor, o.order_number AS op, p.code AS produto, o.status,
       o.produced_quantity AS produzido, p.unit AS un
  FROM public.production_orders o
  JOIN public.products p ON p.id = o.product_id
 WHERE o.company_id = (SELECT id FROM public.companies
                        WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                        ORDER BY created_at LIMIT 1)
   AND p.code IN ('FIO-INT-30', 'TECIDO-INT-01', 'MALHA-INT-30', 'MALHA-INT-TING-30')
 ORDER BY o.created_at;

SELECT lot_number AS lote, remaining_qty AS saldo, quality_status AS qualidade
  FROM public.stock_lots
 WHERE company_id = (SELECT id FROM public.companies
                      WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                      ORDER BY created_at LIMIT 1)
   AND lot_number LIKE '%-INT-LOTE-%'
 ORDER BY lot_number;

SELECT count(*) AS arestas_genealogia_integracao
  FROM public.production_lot_genealogy g
  JOIN public.stock_lots l ON l.id = g.output_lot_id
 WHERE l.lot_number IN ('FIO-INT-LOTE-001', 'TECIDO-INT-LOTE-001', 'MALHA-INT-LOTE-001', 'MALHA-INT-TING-LOTE-001');
