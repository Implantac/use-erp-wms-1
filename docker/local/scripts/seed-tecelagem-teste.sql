-- ============================================================================
-- USE ERP (local) — TESTE GUIADO DE TECELAGEM PLANA na empresa BIL.
--
-- Executa, pelas RPCs oficiais do sistema (nada de dado falso), uma OP de
-- tecelagem completa: artigo de tecido plano com ficha (urdume + trama),
-- lotes de fio reservados por lote, perfil técnico do tear (rolo de
-- urdume, pente, batidas/cm, fios de urdume, largura, metragem, setup),
-- programação finita no tear, apontamento sequencial em metros, eventos
-- do tear (setup, quebra de urdume, quebra de trama), qualidade aprovada
-- e conclusão com genealogia lote-a-lote e o tecido cru em estoque.
--
-- Os parâmetros abaixo (consumos, batidas, tempos) são a FICHA DE TESTE
-- configurada desta empresa fictícia de demonstração — não constantes do
-- sistema. Idempotente: marcador = lote TECIDO-LOTE-TESTE-001.
--
-- Pré-requisitos: migrations aplicadas e BIL cadastrada.
-- Uso (psql): -v admin_email='etcsuporte889@gmail.com' -f seed-tecelagem-teste.sql
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

  -- IDs preferenciais (namespace e4...); a chave natural manda se já existir.
  P_URD constant uuid := 'e4000000-0000-4000-8000-000000000010';
  P_TRM constant uuid := 'e4000000-0000-4000-8000-000000000011';
  P_TEC constant uuid := 'e4000000-0000-4000-8000-000000000012';
  L_URD constant uuid := 'e4000000-0000-4000-8000-000000000020';
  L_TRM constant uuid := 'e4000000-0000-4000-8000-000000000021';
  M_TEAR constant uuid := 'e4000000-0000-4000-8000-000000000030';
  R_TEC constant uuid := 'e4000000-0000-4000-8000-000000000040';

  v_urd uuid; v_trm uuid; v_tec uuid;
  v_lote_urd uuid; v_lote_trm uuid;
  v_tear uuid; v_rota uuid; v_branch_id uuid;

  v_r jsonb;
  v_op uuid;
  v_step record;
  v_insp uuid;
  tec_prod constant numeric[] := ARRAY[500, 480, 480];
  tec_rej  constant numeric[] := ARRAY[0, 20, 0];
  v_plan_prod numeric[];
  v_plan_rej numeric[];
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
              WHERE company_id = v_company_id AND lot_number = 'TECIDO-LOTE-TESTE-001') THEN
    RAISE NOTICE 'TECELAGEM_JA_PREPARADA: o teste de tecelagem ja existe nesta empresa; nada foi alterado.';
    RETURN;
  END IF;

  v_branch_id := COALESCE(
    (SELECT branch_id FROM public.profiles WHERE id = v_user_id),
    (SELECT id FROM public.branches WHERE company_id = v_company_id AND is_headquarters ORDER BY created_at LIMIT 1));

  -- Ator das RPCs = administrador da BIL (mesmo contexto das telas)
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated', 'email', v_admin_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('app.allow_tenant_link', 'on', true);

  PERFORM set_config('session_replication_role', 'replica', true);

  -- Artigo e fios da ficha de teste
  INSERT INTO public.products (id, company_id, code, name, type, unit, item_kind) VALUES
    (P_URD, v_company_id, 'FIO-URD-30',     'Fio 30/1 para urdume',        'raw_material', 'kg', 'insumo'),
    (P_TRM, v_company_id, 'FIO-TRM-30',     'Fio 30/1 para trama',         'raw_material', 'kg', 'insumo'),
    (P_TEC, v_company_id, 'TECIDO-PLANO-01','Tecido plano cru (teste)',    'finished',     'm',  'acabado')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_urd FROM public.products WHERE company_id = v_company_id AND code = 'FIO-URD-30';
  SELECT id INTO v_trm FROM public.products WHERE company_id = v_company_id AND code = 'FIO-TRM-30';
  SELECT id INTO v_tec FROM public.products WHERE company_id = v_company_id AND code = 'TECIDO-PLANO-01';

  -- Operações do roteiro de tecelagem (setor Tecelagem)
  INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector) VALUES
    (v_company_id, 'Preparação e Montagem do Urdume', 'TEC-1', 1, 240, 'Tecelagem'),
    (v_company_id, 'Tecelagem em Tear Plano',         'TEC-2', 2, 480, 'Tecelagem'),
    (v_company_id, 'Revisão do Tecido Cru',           'TEC-3', 3, 60,  'Tecelagem')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.production_routes (id, company_id, code, product_id, is_active) VALUES
    (R_TEC, v_company_id, 'ROT-TEC-01', v_tec, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_rota FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-TEC-01';

  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT r, v_company_id, s, n, t FROM (VALUES
    (v_rota, 1, 'Preparação e Montagem do Urdume', 240),
    (v_rota, 2, 'Tecelagem em Tear Plano', 480),
    (v_rota, 3, 'Revisão do Tecido Cru', 60)
  ) AS x(r, s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = x.r AND rs.sequence = x.s);

  -- Ficha de construção configurada: consumo de fio por metro de tecido
  INSERT INTO public.production_bom (company_id, product_id, component_id, quantity, waste_percentage)
  SELECT v_company_id, p, c, q, 0 FROM (VALUES
    (v_tec, v_urd, 0.115),
    (v_tec, v_trm, 0.100)
  ) AS x(p, c, q)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_bom b WHERE b.company_id = v_company_id AND b.product_id = x.p AND b.component_id = x.c);

  INSERT INTO public.production_machines (id, code, name, company_id, sector) VALUES
    (M_TEAR, 'TEAR-01', 'Tear Plano 01', v_company_id, 'Tecelagem')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_tear FROM public.production_machines WHERE company_id = v_company_id AND code = 'TEAR-01';

  -- Lotes de fio aprovados (urdume e trama separados, como na prática)
  INSERT INTO public.stock_lots (id, company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status, unit_cost) VALUES
    (L_URD, v_company_id, v_urd, 'FIO-URD-30', 'Fio 30/1 para urdume', 'FIO-URD-LOTE-TESTE-001', 70, 70, 'available', 'approved', 22),
    (L_TRM, v_company_id, v_trm, 'FIO-TRM-30', 'Fio 30/1 para trama',  'FIO-TRM-LOTE-TESTE-001', 60, 60, 'available', 'approved', 22)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_lote_urd FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'FIO-URD-LOTE-TESTE-001';
  SELECT id INTO v_lote_trm FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'FIO-TRM-LOTE-TESTE-001';

  INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
  SELECT v_company_id, l.product_id, l.id, v_branch_id, 'ATACADO_INDUSTRIA', l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
   WHERE l.id IN (v_lote_urd, v_lote_trm)
     AND NOT EXISTS (SELECT 1 FROM public.stock_balances b WHERE b.company_id = v_company_id AND b.lot_id = l.id);

  PERFORM set_config('session_replication_role', 'origin', true);

  -- ------------------------------------------------------------------
  -- OP de tecelagem com snapshot e perfil técnico do tear (500 m)
  -- ------------------------------------------------------------------
  v_r := public.create_textile_production_order(
    v_tec, 500, 'tecelagem-teste-op', 'high', now() + interval '5 days',
    NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object(
      'machine_id', v_tear,
      'work_center', 'Tecelagem',
      'warp_product_id', v_urd,
      'weft_product_id', v_trm,
      'warp_lot_id', v_lote_urd,
      'weft_lot_id', v_lote_trm,
      'beam_code', 'ROLO-URD-TESTE-001',
      'reed_code', 'PENTE-TESTE-60',
      'picks_per_cm', 22,
      'warp_thread_count', 2800,
      'planned_width_cm', 160,
      'planned_length_m', 500,
      'setup_minutes', 240,
      'notes', 'Artigo de teste: construção simples urdume/trama fio 30/1'
    ));
  v_op := (v_r ->> 'production_order_id')::uuid;

  -- Reserva por lote: urdume e trama, cada um do seu lote
  PERFORM public.reserve_production_materials(v_op,
    jsonb_build_array(
      jsonb_build_object('component_id', v_urd, 'lot_id', v_lote_urd, 'quantity', 57.5),
      jsonb_build_object('component_id', v_trm, 'lot_id', v_lote_trm, 'quantity', 50)
    ),
    'tecelagem-teste-reserva');

  -- Capacidade finita: janela única no tear, sem dupla alocação
  PERFORM public.schedule_production_order(v_op, now() + interval '1 hour', now() + interval '14 hours',
    'tecelagem-teste-prog', NULL, v_tear, NULL, NULL, 'diurno');

  -- Apontamento sequencial em metros (preparação -> tecelagem -> revisão)
  v_plan_prod := tec_prod; v_plan_rej := tec_rej;
  FOR v_step IN
    SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op ORDER BY sequence
  LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      v_plan_prod[v_step.sequence], v_plan_rej[v_step.sequence], 'Operador Tecelagem');
  END LOOP;

  -- Eventos e paradas do tear
  PERFORM public.record_weaving_event(v_op, 'setup', NULL, v_tear, NULL, NULL, NULL, 'Montagem do rolo de urdume e passamento', 'Operador Tecelagem');
  PERFORM public.record_weaving_event(v_op, 'start', NULL, v_tear, NULL, NULL, NULL, NULL, 'Operador Tecelagem');
  PERFORM public.record_weaving_event(v_op, 'warp_break', NULL, v_tear, NULL, NULL, 12, 'Quebra de urdume', 'Operador Tecelagem');
  PERFORM public.record_weaving_event(v_op, 'weft_break', NULL, v_tear, NULL, NULL, 7, 'Quebra de trama', 'Operador Tecelagem');
  PERFORM public.record_weaving_event(v_op, 'stop', NULL, v_tear, NULL, 480, NULL, 'Fim da metragem do rolo', 'Operador Tecelagem');

  -- Qualidade: revisão do tecido cru aprovada para a metragem boa
  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op, 'Revisão de Tecidos', 480, 20, 'open', 'Tecido cru: revisão concluída, 480 m aprovados e 20 m refugados')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  -- Conclusão transacional: consome os lotes, gera o lote de tecido
  PERFORM public.complete_production_order(v_op, 'tecelagem-teste-conclusao', 480, 20,
    jsonb_build_array(
      jsonb_build_object('component_id', v_urd, 'lot_id', v_lote_urd, 'quantity', 57.5),
      jsonb_build_object('component_id', v_trm, 'lot_id', v_lote_trm, 'quantity', 50)
    ),
    'TECIDO-LOTE-TESTE-001');

  RAISE NOTICE 'TECELAGEM_TESTE_OK: OP de tecelagem concluida com perfil do tear, eventos, qualidade e lote de tecido em estoque.';
END $$;

COMMIT;

-- Conferência do resultado
SELECT o.order_number AS op, p.code AS produto, o.sector AS setor, o.status,
       o.produced_quantity AS produzido, p.unit AS un
  FROM public.production_orders o
  JOIN public.products p ON p.id = o.product_id
 WHERE o.company_id = (SELECT id FROM public.companies
                        WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                        ORDER BY created_at LIMIT 1)
   AND p.code = 'TECIDO-PLANO-01';

SELECT lot_number AS lote, product_code AS produto, remaining_qty AS saldo, quality_status AS qualidade
  FROM public.stock_lots
 WHERE company_id = (SELECT id FROM public.companies
                      WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                      ORDER BY created_at LIMIT 1)
   AND lot_number IN ('FIO-URD-LOTE-TESTE-001', 'FIO-TRM-LOTE-TESTE-001', 'TECIDO-LOTE-TESTE-001')
 ORDER BY lot_number;

SELECT wp.beam_code AS rolo_urdume, wp.reed_code AS pente, wp.picks_per_cm AS batidas_cm,
       wp.planned_length_m AS metragem_planejada
  FROM public.weaving_order_profiles wp
  JOIN public.production_orders o ON o.id = wp.production_order_id
 WHERE o.company_id = (SELECT id FROM public.companies
                        WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                        ORDER BY created_at LIMIT 1)
 ORDER BY wp.created_at DESC LIMIT 1;
