-- ============================================================================
-- USE ERP (local) — FLUXO COMERCIAL COMPLETO: pedido -> produção -> entrega.
--
-- Demonstra, na empresa BIL e pelas RPCs oficiais, o ciclo que o usuário
-- opera no dia a dia:
--   PV-INT-001  tecido plano vendido e expedido do estoque produzido;
--   PV-INT-002  fio vendido e expedido (produção própria da fiação);
--   PV-INT-003  malha tingida vendida e expedida;
--   PV-INT-004  TINTURARIA PARA TERCEIRO: o cliente envia a própria malha,
--               o pedido gera OP na Central de Tinturaria vinculada a ele,
--               e a malha beneficiada volta expedida ao mesmo cliente.
-- A expedição é a do WMS (reserva FIFO por lote liberado -> separação que
-- baixa o lote -> expedição documental): dá para afirmar qual lote foi
-- para qual cliente.
--
-- Idempotente: marcador = pedido PV-INT-004.
-- Pré-requisitos: BIL cadastrada e cadeia integrada preparada
-- (PREPARAR-INTEGRACAO.bat) — são os lotes dela que este fluxo entrega.
-- Uso (psql): -v admin_email='etcsuporte889@gmail.com' -f seed-pedidos-clientes.sql
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

  C_HORIZ constant uuid := 'e6000000-0000-4000-8000-000000000010';
  C_ESTRE constant uuid := 'e6000000-0000-4000-8000-000000000011';
  L_TERC  constant uuid := 'e6000000-0000-4000-8000-000000000020';

  v_cli_horiz uuid; v_cli_estre uuid;
  v_tec uuid; v_fio uuid; v_ting uuid; v_mal uuid; v_cor uuid;
  v_lote_cor uuid; v_lote_terc uuid; v_jet uuid;
  v_pv1 uuid; v_pv2 uuid; v_pv3 uuid; v_pv4 uuid; v_item4 uuid;
  v_r jsonb; v_op uuid; v_step record; v_insp uuid;
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

  IF EXISTS (SELECT 1 FROM public.orders WHERE company_id = v_company_id AND number = 'PV-INT-004') THEN
    RAISE NOTICE 'PEDIDOS_JA_PREPARADOS: o fluxo comercial de pedidos ja existe; nada foi alterado.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'MALHA-INT-TING-LOTE-001') THEN
    RAISE EXCEPTION 'Cadeia integrada nao encontrada: rode antes o PREPARAR-INTEGRACAO.bat.';
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

  INSERT INTO public.clients (id, company_id, code, name, trade_name, document_type, document, email, phone) VALUES
    (C_HORIZ, v_company_id, 'CLI-INT-001', 'Confecções Horizonte Ltda', 'Horizonte Confecções', 'CNPJ', '12345678000190', 'compras@horizonte.example.com.br', '(11) 3000-1000'),
    (C_ESTRE, v_company_id, 'CLI-INT-002', 'Malharia Estrela', 'Malharia EstrelaSul', 'CNPJ', '98765432000110', 'producao@estrelasul.example.com.br', '(47) 3000-2000')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli_horiz FROM public.clients WHERE company_id = v_company_id AND document = '12345678000190';
  SELECT id INTO v_cli_estre FROM public.clients WHERE company_id = v_company_id AND document = '98765432000110';

  SELECT id INTO v_tec  FROM public.products WHERE company_id = v_company_id AND code = 'TECIDO-INT-01';
  SELECT id INTO v_fio  FROM public.products WHERE company_id = v_company_id AND code = 'FIO-INT-30';
  SELECT id INTO v_ting FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-INT-TING-30';
  SELECT id INTO v_mal  FROM public.products WHERE company_id = v_company_id AND code = 'MALHA-INT-30';
  SELECT id INTO v_cor  FROM public.products WHERE company_id = v_company_id AND code = 'CORANTE-INT-AZUL';
  SELECT id INTO v_lote_cor FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'CORANTE-INT-LOTE-001';
  SELECT id INTO v_jet FROM public.production_machines WHERE company_id = v_company_id AND code = 'JET-INT-01';

  -- Pedidos dos clientes
  INSERT INTO public.orders (company_id, number, client_id, client_name, date, subtotal, discount, shipping, total, payment_method, payment_condition, status, priority) VALUES
    (v_company_id, 'PV-INT-001', v_cli_horiz, 'Confecções Horizonte Ltda', now(), 8400, 0, 0, 8400, 'boleto', '28 dias', 'confirmed', 'normal'),
    (v_company_id, 'PV-INT-002', v_cli_estre, 'Malharia EstrelaSul', now(), 160, 0, 0, 160, 'boleto', '14 dias', 'confirmed', 'normal'),
    (v_company_id, 'PV-INT-003', v_cli_horiz, 'Confecções Horizonte Ltda', now(), 4640, 0, 0, 4640, 'boleto', '28 dias', 'confirmed', 'high'),
    (v_company_id, 'PV-INT-004', v_cli_estre, 'Malharia EstrelaSul', now(), 600, 0, 0, 600, 'boleto', '14 dias', 'confirmed', 'high')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_pv1 FROM public.orders WHERE company_id = v_company_id AND number = 'PV-INT-001';
  SELECT id INTO v_pv2 FROM public.orders WHERE company_id = v_company_id AND number = 'PV-INT-002';
  SELECT id INTO v_pv3 FROM public.orders WHERE company_id = v_company_id AND number = 'PV-INT-003';
  SELECT id INTO v_pv4 FROM public.orders WHERE company_id = v_company_id AND number = 'PV-INT-004';

  INSERT INTO public.order_items (order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total)
  SELECT v_pv1, v_company_id, v_tec, 'TECIDO-INT-01', 'Tecido plano cru (integração)', 300, 28, 0, 8400
   WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = v_pv1);
  INSERT INTO public.order_items (order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total)
  SELECT v_pv2, v_company_id, v_fio, 'FIO-INT-30', 'Fio 30/1 cardado (integração)', 5, 32, 0, 160
   WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = v_pv2);
  INSERT INTO public.order_items (order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total)
  SELECT v_pv3, v_company_id, v_ting, 'MALHA-INT-TING-30', 'Malha tingida (integração)', 80, 58, 0, 4640
   WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = v_pv3);
  -- No beneficiamento para terceiro, o item do pedido é a malha beneficiada
  -- devolvida ao cliente; o preço é o do serviço de tingimento (R$/kg).
  INSERT INTO public.order_items (order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total)
  SELECT v_pv4, v_company_id, v_ting, 'MALHA-INT-TING-30', 'Malha tingida (integração)', 48, 12.5, 0, 600
   WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = v_pv4);
  SELECT id INTO v_item4 FROM public.order_items WHERE order_id = v_pv4 LIMIT 1;

  -- Material do cliente (terceiro): malha crua da EstrelaSul aguardando banho
  INSERT INTO public.stock_lots (id, company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status, unit_cost, origin, notes) VALUES
    (L_TERC, v_company_id, v_mal, 'MALHA-INT-30', 'Malha crua (integração)', 'MALHA-TERC-LOTE-001', 52, 52, 'available', 'approved', 0, 'terceiro', 'Material do cliente Malharia EstrelaSul — tingimento por conta e ordem (PV-INT-004)')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_lote_terc FROM public.stock_lots WHERE company_id = v_company_id AND lot_number = 'MALHA-TERC-LOTE-001';
  INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
  SELECT v_company_id, v_mal, v_lote_terc, v_branch_id, 'ATACADO_INDUSTRIA', 'MALHA-INT-30', 'Malha crua (integração)', 52, 0
   WHERE NOT EXISTS (SELECT 1 FROM public.stock_balances b WHERE b.company_id = v_company_id AND b.lot_id = v_lote_terc);

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Entregas do que já está produzido (FIFO por lote liberado)
  PERFORM public.wms_reserve_order_stock(v_pv1);
  PERFORM public.wms_pick_order_stock(v_pv1);
  PERFORM public.wms_ship_order(v_pv1);

  PERFORM public.wms_reserve_order_stock(v_pv2);
  PERFORM public.wms_pick_order_stock(v_pv2);
  PERFORM public.wms_ship_order(v_pv2);

  PERFORM public.wms_reserve_order_stock(v_pv3);
  PERFORM public.wms_pick_order_stock(v_pv3);
  PERFORM public.wms_ship_order(v_pv3);

  -- PV-INT-004: o pedido PROGRAMA a tinturaria (OP vinculada ao pedido)
  v_r := public.create_textile_production_order(v_ting, 50, 'pedidos-op-tinturaria-terceiro', 'high',
    now() + interval '4 days', NULL, v_pv4, v_item4, v_cli_estre, 'Malharia EstrelaSul', '{}'::jsonb);
  v_op := (v_r ->> 'production_order_id')::uuid;

  PERFORM public.upsert_sector_order_profile(v_op, 'tinturaria', jsonb_build_object(
    'machine_id', v_jet, 'work_center', 'Tinturaria', 'color_name', 'Azul Royal',
    'color_code', 'AZ-01', 'bath_ratio', 8, 'batch_code', 'BANHO-TERC-001',
    'lab_l', 35, 'lab_a', 5, 'lab_b', -38, 'planned_output_kg', 50,
    'notes', 'Beneficiamento para terceiro: malha do cliente (lote MALHA-TERC-LOTE-001)'));

  PERFORM public.reserve_production_materials(v_op,
    jsonb_build_array(
      jsonb_build_object('component_id', v_mal, 'lot_id', v_lote_terc, 'quantity', 50),
      jsonb_build_object('component_id', v_cor, 'lot_id', v_lote_cor, 'quantity', 1.25)
    ),
    'pedidos-reserva-tinturaria-terceiro');
  PERFORM public.schedule_production_order(v_op, now() + interval '56 hours', now() + interval '68 hours',
    'pedidos-prog-tinturaria-terceiro', NULL, v_jet, NULL, NULL, 'diurno');

  FOR v_step IN SELECT id, sequence FROM public.production_order_steps WHERE production_order_id = v_op ORDER BY sequence LOOP
    PERFORM public.record_production_step_progress(v_step.id, 'progress',
      (ARRAY[50, 48, 48])[v_step.sequence], (ARRAY[0, 2, 0])[v_step.sequence], 'Tintureiro');
  END LOOP;

  PERFORM public.record_sector_event(v_op, 'tinturaria', 'bath_start', NULL, v_jet, NULL, 50, NULL, 'Banho do material do cliente', 'Tintureiro');
  PERFORM public.record_sector_event(v_op, 'tinturaria', 'color_release', NULL, v_jet, NULL, NULL, NULL, 'Cor liberada contra o padrão do cliente', 'Tintureiro');

  INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, approved_quantity, rejected_quantity, status, notes)
  VALUES (v_company_id, v_op, 'Laboratório de Cor', 48, 2, 'open', 'Cor aprovada; devolução ao cliente')
  RETURNING id INTO v_insp;
  PERFORM public.decide_production_quality_inspection(v_insp, 'approved');

  PERFORM public.complete_production_order(v_op, 'pedidos-conclusao-tinturaria-terceiro', 48, 2,
    jsonb_build_array(
      jsonb_build_object('component_id', v_mal, 'lot_id', v_lote_terc, 'quantity', 50),
      jsonb_build_object('component_id', v_cor, 'lot_id', v_lote_cor, 'quantity', 1.25)
    ),
    'MALHA-TING-TERC-LOTE-001');

  -- E o beneficiado volta ao cliente pelo mesmo fluxo de expedição
  PERFORM public.wms_reserve_order_stock(v_pv4);
  PERFORM public.wms_pick_order_stock(v_pv4);
  PERFORM public.wms_ship_order(v_pv4);

  RAISE NOTICE 'PEDIDOS_FLUXO_OK: pedidos emitidos, tinturaria de terceiro programada e entregas expedidas por lote.';
END $$;

COMMIT;

SELECT number AS pedido, client_name AS cliente, total, status
  FROM public.orders
 WHERE company_id = (SELECT id FROM public.companies
                      WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                      ORDER BY created_at LIMIT 1)
   AND number LIKE 'PV-INT-%'
 ORDER BY number;

SELECT lot_number AS lote, remaining_qty AS saldo_restante
  FROM public.stock_lots
 WHERE company_id = (SELECT id FROM public.companies
                      WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
                      ORDER BY created_at LIMIT 1)
   AND lot_number IN ('TECIDO-INT-LOTE-001', 'FIO-INT-LOTE-001', 'MALHA-INT-TING-LOTE-001', 'MALHA-TING-TERC-LOTE-001', 'CORANTE-INT-LOTE-001')
 ORDER BY lot_number;
