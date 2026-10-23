-- ============================================================================
-- USE ERP (local) — FLUXO DE TESTE TÊXTIL COMPLETO (dados navegáveis)
--
-- Preenche a empresa BIL com um ciclo funcional de ponta a ponta, executado
-- pelas MESMAS RPCs que as telas usam (nada é "dado de mentira"):
--
--   1. Cliente entra em contato  -> cliente cadastrado
--   2. Comercial emite o pedido -> pedido PV-TESTE-0001 (50 kg de malha
--      tingida, confirmado, aguardando expedição)
--   3. Produção classifica a pluma e separa em lotes
--      -> 2 lotes classificados de algodão em pluma (300 kg cada)
--   4. Pluma entra na fiação     -> OP de fiação consome 118 kg e produz
--      93 kg de fio 30/1 cardado (lote próprio, qualidade aprovada)
--   5. Fio entra na malharia     -> OP produz 87 kg de malha crua
--   6. Malha crua entra na tinturaria -> OP consome 83,2 kg de malha crua
--      + 2 kg de corante e produz 75 kg de malha tingida (qualidade OK)
--   7. Malha pronta entra no estoque -> lote de 75 kg disponível, com
--      genealogia pluma->fio->malha->tingida persistida e custo calculado.
--
-- Rendimentos/BOM/receita são registros de configuração da empresa
-- (production_bom), iguais aos homologados na jornada SQL do gerente:
-- fiação 1,18 kg pluma/kg fio; malharia 1,03 kg fio/kg malha;
-- tingimento 1,04 kg malha/kg tingida + 0,025 kg corante/kg.
--
-- Cadastros são resolvidos por chave natural (código/documento): se a
-- empresa já tiver um produto/cliente/máquina com o mesmo código, ele é
-- reutilizado em vez de duplicar. Idempotente por marcador: se o lote
-- final MALHA-TING-LOTE-TESTE-001 já existir, nada é alterado.
-- Pré-requisito: BIL cadastrada (INSTALAR-TUDO.bat / cadastrar-bil).
--
-- Uso (os scripts preparar-fluxo-teste.ps1/.bat fazem isso por você):
--   docker compose -f docker-compose.local.yml --env-file .env.local \
--     exec -T db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -v admin_email='etcsuporte889@gmail.com' \
--     -f /tmp/seed-fluxo-teste.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?admin_email}
\else
  \set admin_email etcsuporte889@gmail.com
\endif

-- psql nao interpola :'variavel' dentro de blocos $$; passamos o valor
-- por GUC de sessao e o bloco le com current_setting().
SELECT set_config('app.admin_email', :'admin_email', false);

BEGIN;

DO $$
DECLARE
  v_admin_email text := lower(trim(current_setting('app.admin_email', true)));
  v_user_id uuid;
  v_company_id uuid;

  -- IDs preferenciais na criação (namespace e3...); se a chave natural já
  -- existir, o ID real é resolvido e usado.
  P_CLIENTE constant uuid := 'e3000000-0000-4000-8000-000000000001';
  P_PLUMA   constant uuid := 'e3000000-0000-4000-8000-000000000010';
  P_FIO     constant uuid := 'e3000000-0000-4000-8000-000000000011';
  P_MALHA   constant uuid := 'e3000000-0000-4000-8000-000000000012';
  P_TING    constant uuid := 'e3000000-0000-4000-8000-000000000013';
  P_CORANTE constant uuid := 'e3000000-0000-4000-8000-000000000014';
  L_PLUMA1  constant uuid := 'e3000000-0000-4000-8000-000000000020';
  L_PLUMA2  constant uuid := 'e3000000-0000-4000-8000-000000000021';
  L_CORANTE constant uuid := 'e3000000-0000-4000-8000-000000000022';
  M_FILA    constant uuid := 'e3000000-0000-4000-8000-000000000030';
  M_CIRC    constant uuid := 'e3000000-0000-4000-8000-000000000031';
  M_JET     constant uuid := 'e3000000-0000-4000-8000-000000000032';
  R_FIA     constant uuid := 'e3000000-0000-4000-8000-000000000040';
  R_MAL     constant uuid := 'e3000000-0000-4000-8000-000000000041';
  R_BEN     constant uuid := 'e3000000-0000-4000-8000-000000000042';
  PED       constant uuid := 'e3000000-0000-4000-8000-000000000050';
  PED_ITEM  constant uuid := 'e3000000-0000-4000-8000-000000000051';

  v_cliente uuid; v_pluma uuid; v_fio uuid; v_malha uuid; v_ting uuid; v_corante uuid;
  v_fila uuid; v_circ uuid; v_jet uuid; v_rota_fia uuid; v_rota_mal uuid; v_rota_ben uuid;
  v_lote_pluma1 uuid; v_lote_pluma2 uuid; v_lote_corante uuid; v_pedido uuid; v_item uuid;
  v_branch_id uuid;

  v_r jsonb;
  v_op uuid;
  v_step record;
  v_insp uuid;
  v_lot uuid;
  v_plan_prod numeric[];
  v_plan_rej numeric[];
  fia_prod constant numeric[] := ARRAY[97,96,95,94,93];
  fia_rej  constant numeric[] := ARRAY[3,1,1,1,1];
  mal_prod constant numeric[] := ARRAY[88,87];
  mal_rej  constant numeric[] := ARRAY[2,1];
  ben_prod constant numeric[] := ARRAY[79,78,77,76,75];
  ben_rej  constant numeric[] := ARRAY[1,1,1,1,1];
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
              WHERE company_id = v_company_id AND lot_number = 'MALHA-TING-LOTE-TESTE-001') THEN
    RAISE NOTICE 'FLUXO_JA_PREPARADO: o fluxo de teste ja existe nesta empresa; nada foi alterado.';
    RETURN;
  END IF;

  -- Filial das OPs/saldos: a mesma que create_textile_production_order usa
  -- (filial do perfil do usuario, senao a matriz da empresa)
  v_branch_id := COALESCE(
    (SELECT branch_id FROM public.profiles WHERE id = v_user_id),
    (SELECT id FROM public.branches WHERE company_id = v_company_id AND is_headquarters ORDER BY created_at LIMIT 1));

  -- Ator das RPCs = administrador da BIL (mesmo contexto das telas)
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated', 'email', v_admin_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('app.allow_tenant_link', 'on', true);

  -- ------------------------------------------------------------------
  -- Cadastros e saldos iniciais (seed administrativo: bypass de triggers
  -- de imutabilidade, igual ao harness de homologacao)
  -- ------------------------------------------------------------------
  PERFORM set_config('session_replication_role', 'replica', true);

  INSERT INTO public.clients (id, company_id, code, name, trade_name, document_type, document, email, phone)
  VALUES (P_CLIENTE, v_company_id, 'CLI-TESTE-001', 'Confecção Exemplo LTDA', 'Confecção Exemplo', 'CNPJ', '11222333000181', 'compras@confeccaoexemplo.com.br', '(11) 4002-8922')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cliente FROM public.clients WHERE company_id = v_company_id AND document = '11222333000181';

  INSERT INTO public.products (id, company_id, code, name, type, unit, item_kind) VALUES
    (P_PLUMA,   v_company_id, 'PLUMA-01',      'Algodão em pluma',              'raw_material', 'kg', 'materia_prima'),
    (P_FIO,     v_company_id, 'FIO-30-CARD',   'Fio 30/1 cardado',              'finished',     'kg', 'insumo'),
    (P_MALHA,   v_company_id, 'MALHA-30',      'Malha fio 30 crua',             'finished',     'kg', 'acabado'),
    (P_TING,    v_company_id, 'MALHA-TING-30', 'Malha fio 30 tingida e acabada','finished',     'kg', 'acabado'),
    (P_CORANTE, v_company_id, 'CORANTE-AZUL',  'Corante reativo azul',          'raw_material', 'kg', 'insumo')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_pluma   FROM public.products WHERE company_id = v_company_id AND code = 'PLUMA-01';
  SELECT id INTO v_fio     FROM public.products WHERE company_id = v_company_id AND code = 'FIO-30-CARD';
  SELECT id INTO v_malha   FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-30';
  SELECT id INTO v_ting    FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-TING-30';
  SELECT id INTO v_corante FROM public.products WHERE company_id = v_company_id AND code = 'CORANTE-AZUL';

  -- Catálogo de operações da empresa (setor por operação)
  INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector) VALUES
    (v_company_id, 'Abertura e Limpeza',      'ETP-1', 1, 60, 'Fiação'),
    (v_company_id, 'Cardagem',                'ETP-2', 2, 60, 'Fiação'),
    (v_company_id, 'Passador',                'ETP-3', 3, 60, 'Fiação'),
    (v_company_id, 'Maçaroqueira',            'ETP-4', 4, 60, 'Fiação'),
    (v_company_id, 'Filatório de Anel',       'ETP-5', 5, 60, 'Fiação'),
    (v_company_id, 'Malharia Circular',       'ETP-6', 6, 60, 'Malharia'),
    (v_company_id, 'Revisão de Malha',        'ETP-7', 7, 60, 'Malharia'),
    (v_company_id, 'Preparação e Purga',      'BEN-1', 1, 90, 'Tinturaria'),
    (v_company_id, 'Tingimento',              'BEN-2', 2, 90, 'Tinturaria'),
    (v_company_id, 'Centrifugação',           'BEN-3', 3, 90, 'Tinturaria'),
    (v_company_id, 'Secagem e Estabilização', 'BEN-4', 4, 90, 'Acabamento'),
    (v_company_id, 'Revisão e Rolagem',       'BEN-5', 5, 90, 'Acabamento')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.production_routes (id, company_id, code, product_id, is_active) VALUES
    (R_FIA, v_company_id, 'ROT-FIA-30', v_fio, true),
    (R_MAL, v_company_id, 'ROT-MAL-30', v_malha, true),
    (R_BEN, v_company_id, 'ROT-BEN-30', v_ting, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_rota_fia FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-FIA-30';
  SELECT id INTO v_rota_mal FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-MAL-30';
  SELECT id INTO v_rota_ben FROM public.production_routes WHERE company_id = v_company_id AND code = 'ROT-BEN-30';

  INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
  SELECT r, v_company_id, s, n, t FROM (VALUES
    (v_rota_fia, 1, 'Abertura e Limpeza', 60),
    (v_rota_fia, 2, 'Cardagem', 60),
    (v_rota_fia, 3, 'Passador', 60),
    (v_rota_fia, 4, 'Maçaroqueira', 60),
    (v_rota_fia, 5, 'Filatório de Anel', 60),
    (v_rota_mal, 1, 'Malharia Circular', 60),
    (v_rota_mal, 2, 'Revisão de Malha', 60),
    (v_rota_ben, 1, 'Preparação e Purga', 90),
    (v_rota_ben, 2, 'Tingimento', 90),
    (v_rota_ben, 3, 'Centrifugação', 90),
    (v_rota_ben, 4, 'Secagem e Estabilização', 90),
    (v_rota_ben, 5, 'Revisão e Rolagem', 90)
  ) AS x(r, s, n, t)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = x.r AND rs.sequence = x.s);

  -- Estruturas/receitas configuradas da empresa (não são constantes do sistema)
  INSERT INTO public.production_bom (company_id, product_id, component_id, quantity, waste_percentage)
  SELECT v_company_id, p, c, q, 0 FROM (VALUES
    (v_fio, v_pluma, 1.18), (v_malha, v_fio, 1.03), (v_ting, v_malha, 1.04), (v_ting, v_corante, 0.025)
  ) AS x(p, c, q)
  WHERE NOT EXISTS (SELECT 1 FROM public.production_bom b WHERE b.company_id = v_company_id AND b.product_id = x.p AND b.component_id = x.c);

  INSERT INTO public.production_machines (id, code, name, company_id, sector) VALUES
    (M_FILA, 'FIL-01',  'Filatório de Anel 01', v_company_id, 'Fiação'),
    (M_CIRC, 'CIRC-01', 'Tear Circular 01',     v_company_id, 'Malharia'),
    (M_JET,  'JET-01',  'Jet de Tingimento 01', v_company_id, 'Tinturaria')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_fila FROM public.production_machines WHERE company_id = v_company_id AND code = 'FIL-01';
  SELECT id INTO v_circ FROM public.production_machines WHERE company_id = v_company_id AND code = 'CIRC-01';
  SELECT id INTO v_jet  FROM public.production_machines WHERE company_id = v_company_id AND code = 'JET-01';

  -- Produção classifica a pluma e separa em lotes aprovados
  INSERT INTO public.stock_lots (id, company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status, unit_cost) VALUES
    (L_PLUMA1,  v_company_id, v_pluma,   'PLUMA-01',     'Algodão em pluma',     'PLUMA-LOTE-TESTE-001',   300, 300, 'available', 'approved', 8),
    (L_PLUMA2,  v_company_id, v_pluma,   'PLUMA-01',     'Algodão em pluma',     'PLUMA-LOTE-TESTE-002',   300, 300, 'available', 'approved', 8),
    (L_CORANTE, v_company_id, v_corante, 'CORANTE-AZUL', 'Corante reativo azul', 'CORANTE-LOTE-TESTE-001',  10,  10, 'available', 'approved', 40)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_lote_pluma1  FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'PLUMA-LOTE-TESTE-001';
  SELECT id INTO v_lote_pluma2  FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'PLUMA-LOTE-TESTE-002';
  SELECT id INTO v_lote_corante FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'CORANTE-LOTE-TESTE-001';

  INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
  SELECT v_company_id, l.product_id, l.id, v_branch_id, 'ATACADO_INDUSTRIA', l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
   WHERE l.id IN (v_lote_pluma1, v_lote_pluma2, v_lote_corante)
     AND NOT EXISTS (SELECT 1 FROM public.stock_balances b WHERE b.company_id = v_company_id AND b.lot_id = l.id);

  -- Comercial emite o pedido do cliente (50 kg de malha tingida)
  INSERT INTO public.orders (id, company_id, number, client_id, client_name, date, subtotal, discount, shipping, total, payment_method, payment_condition, status, priority)
  VALUES (PED, v_company_id, 'PV-TESTE-0001', v_cliente, 'Confecção Exemplo LTDA', now(), 3000, 0, 0, 3000, 'boleto', '28 dias', 'confirmed', 'normal')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_pedido FROM public.orders WHERE company_id = v_company_id AND number = 'PV-TESTE-0001';
  INSERT INTO public.order_items (id, order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total)
  SELECT PED_ITEM, v_pedido, v_company_id, v_ting, 'MALHA-TING-30', 'Malha fio 30 tingida e acabada', 50, 60, 0, 3000
   WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = v_pedido AND i.product_id = v_ting);

  PERFORM set_config('session_replication_role', 'origin', true);

  -- ------------------------------------------------------------------
  -- 4. FIAÇÃO: pluma -> fio 30 cardado (100 kg planejados, 93 bons)
  -- ------------------------------------------------------------------
  v_r := public.create_textile_production_order(v_fio, 100, 'fluxo-teste-op-fiacao', 'high', now() + interval '5 days');
  v_op := (v_r ->> 'production_order_id')::uuid;
  PERFORM public.reserve_production_materials(v_op,
    jsonb_build_array(jsonb_build_object('component_id', v_pluma, 'lot_id', v_lote_pluma1, 'quantity', 118)),
    'fluxo-teste-reserva-fiacao');
  PERFORM public.schedule_production_order(v_op, now() + interval '1 hour', now() + interval '9 hours',
    'fluxo-teste-prog-fiacao', NULL, v_fila, NULL, NULL, 'diurno');
  v_plan_prod := fia_prod; v_plan_rej := fia_rej;
  FOR v_step IN
    SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op ORDER BY sequence
  LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      v_plan_prod[v_step.sequence], v_plan_rej[v_step.sequence], 'Operador Fiação');
  END LOOP;
  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op, 'Laboratório', 93, 4, 'open', 'Fio 30 cardado: título e resistência aprovados')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');
  PERFORM public.complete_production_order(v_op, 'fluxo-teste-conclusao-fiacao', 93, 7,
    jsonb_build_array(jsonb_build_object('component_id', v_pluma, 'lot_id', v_lote_pluma1, 'quantity', 118)),
    'FIO30-LOTE-TESTE-001');

  -- ------------------------------------------------------------------
  -- 5. MALHARIA: fio -> malha crua (90 kg planejados, 87 bons)
  -- ------------------------------------------------------------------
  SELECT id INTO v_lot FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'FIO30-LOTE-TESTE-001';
  v_r := public.create_textile_production_order(v_malha, 90, 'fluxo-teste-op-malharia', 'high', now() + interval '5 days');
  v_op := (v_r ->> 'production_order_id')::uuid;
  PERFORM public.reserve_production_materials(v_op,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lot, 'quantity', 92.7)),
    'fluxo-teste-reserva-malharia');
  PERFORM public.schedule_production_order(v_op, now() + interval '1 day 1 hour', now() + interval '1 day 9 hours',
    'fluxo-teste-prog-malharia', NULL, v_circ, NULL, NULL, 'diurno');
  v_plan_prod := mal_prod; v_plan_rej := mal_rej;
  FOR v_step IN
    SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op ORDER BY sequence
  LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      v_plan_prod[v_step.sequence], v_plan_rej[v_step.sequence], 'Operador Malharia');
  END LOOP;
  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op, 'Laboratório', 87, 2, 'open', 'Malha crua: gramatura e largura aprovadas')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');
  PERFORM public.complete_production_order(v_op, 'fluxo-teste-conclusao-malharia', 87, 3,
    jsonb_build_array(jsonb_build_object('component_id', v_fio, 'lot_id', v_lot, 'quantity', 92.7)),
    'MALHA-CRUA-LOTE-TESTE-001');

  -- ------------------------------------------------------------------
  -- 6/7. TINTURARIA: malha crua + corante -> malha tingida no estoque
  --      (OP vinculada ao pedido PV-TESTE-0001)
  -- ------------------------------------------------------------------
  SELECT id INTO v_lot FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'MALHA-CRUA-LOTE-TESTE-001';
  SELECT id INTO v_item FROM public.order_items WHERE order_id = v_pedido AND product_id = v_ting LIMIT 1;
  v_r := public.create_textile_production_order(v_ting, 80, 'fluxo-teste-op-tinturaria', 'high', now() + interval '5 days',
    NULL, v_pedido, v_item, v_cliente, 'Confecção Exemplo LTDA');
  v_op := (v_r ->> 'production_order_id')::uuid;
  PERFORM public.reserve_production_materials(v_op,
    jsonb_build_array(
      jsonb_build_object('component_id', v_malha, 'lot_id', v_lot, 'quantity', 83.2),
      jsonb_build_object('component_id', v_corante, 'lot_id', v_lote_corante, 'quantity', 2)),
    'fluxo-teste-reserva-tinturaria');
  PERFORM public.schedule_production_order(v_op, now() + interval '2 days 1 hour', now() + interval '2 days 9 hours',
    'fluxo-teste-prog-tinturaria', NULL, v_jet, NULL, NULL, 'diurno');
  v_plan_prod := ben_prod; v_plan_rej := ben_rej;
  FOR v_step IN
    SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op ORDER BY sequence
  LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      v_plan_prod[v_step.sequence], v_plan_rej[v_step.sequence], 'Operador Tinturaria');
  END LOOP;
  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op, 'Laboratório', 75, 3, 'open', 'Cor aprovada contra padrão do cliente; solidez e toque aprovados')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');
  PERFORM public.complete_production_order(v_op, 'fluxo-teste-conclusao-tinturaria', 75, 5,
    jsonb_build_array(
      jsonb_build_object('component_id', v_malha, 'lot_id', v_lot, 'quantity', 83.2),
      jsonb_build_object('component_id', v_corante, 'lot_id', v_lote_corante, 'quantity', 2)),
    'MALHA-TING-LOTE-TESTE-001');

  RAISE NOTICE 'FLUXO_TESTE_OK: pedido, producao (fiacao/malharia/tinturaria) e estoque preparados.';
END $$;

COMMIT;

-- ======================= conferência (aparece na tela) =======================
SELECT o.number AS pedido, o.status, o.total
  FROM public.orders o
  JOIN public.companies c ON c.id = o.company_id
 WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
   AND o.number = 'PV-TESTE-0001';

SELECT po.order_number AS op, po.product_code AS produto, po.sector AS setor,
       po.status, po.produced_quantity AS produzido, po.unit AS un
  FROM public.production_orders po
  JOIN public.companies c ON c.id = po.company_id
 WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
   AND po.product_code IN ('FIO-30-CARD', 'MALHA-30', 'MALHA-TING-30')
 ORDER BY po.created_at;

SELECT sl.lot_number AS lote, sl.product_code AS produto, sl.remaining_qty AS saldo_kg, sl.quality_status AS qualidade
  FROM public.stock_lots sl
  JOIN public.companies c ON c.id = sl.company_id
 WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
   AND sl.lot_number LIKE '%-TESTE-%'
 ORDER BY sl.lot_number;
