-- ============================================================================
-- USE ERP (local) — Dia operacional das Lojas (dados vivos em todas as telas)
--
-- Rode DEPOIS de PREPARAR-LOJAS-TEXAS. Idempotente (marcador SEED-OP nas notas).
--
-- Popula o fluxo OFICIAL (stock_transfer_orders / stock_movements /
-- supply_requests / intercompany / operational_tasks) com um dia típico:
--   OP1  CD -> Loja 1   em SEPARAÇÃO           (Em Operação)
--   OP2  Loja 2 -> Loja 1 em TRÂNSITO          (a receber na Loja 1)
--   OP3  CD -> Loja 2   SUGERIDA               (fila do gestor)
--   OP4  CD -> Loja 1   RECEBIDA C/ DIVERGÊNCIA (20 expedidas, 18 recebidas)
--   OP5  CD -> Loja 1   ENCERRADA              (histórico completo)
--   + 1 solicitação de abastecimento PENDENTE (análise Loja x CD x fábrica)
--   + 1 pedido intercompany PENDENTE (fila de decisão da indústria)
--   + 2 tarefas operacionais pendentes (alertas da Central da Loja)
-- Movimentos usam os mesmos tipos/ledger do fluxo oficial (sem 2º ledger).
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_loja_id uuid;
  v_cd uuid; v_loja uuid; v_loja2 uuid;
  v_user uuid;
  v_order uuid;
  r record;
BEGIN
  SELECT id INTO v_loja_id FROM public.companies
  WHERE cnpj = '57.832.353/0001-75' ORDER BY created_at LIMIT 1;
  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'TEXAS FARM STORE nao encontrada — rode PREPARAR-GRUPO-ZIPO.bat antes.';
  END IF;
  SELECT id INTO v_cd FROM public.branches WHERE company_id = v_loja_id AND code = 'CD' LIMIT 1;
  SELECT id INTO v_loja FROM public.branches WHERE company_id = v_loja_id AND code = 'Loja' LIMIT 1;
  SELECT id INTO v_loja2 FROM public.branches WHERE company_id = v_loja_id AND code = 'L2' LIMIT 1;
  IF v_cd IS NULL OR v_loja IS NULL OR v_loja2 IS NULL THEN
    RAISE EXCEPTION 'Unidades incompletas — rode PREPARAR-LOJAS-TEXAS.bat antes.';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE email = 'etcsuporte889@gmail.com' LIMIT 1;
  IF v_user IS NULL THEN
    SELECT user_id INTO v_user FROM public.user_roles
    WHERE company_id = v_loja_id AND role = 'admin' LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario gestor nao encontrado — rode PREPARAR-GRUPO-ZIPO.bat antes.';
  END IF;

  PERFORM set_config('app.stock_transfer_rpc', 'on', true);

  -- OP1: CD -> Loja 1 em SEPARAÇÃO (2 itens)
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_orders WHERE notes = 'SEED-OP1') THEN
    INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes)
    VALUES (v_loja_id, v_cd, v_loja, 'SEPARAÇÃO', v_user, 'SEED-OP1') RETURNING id INTO v_order;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty)
    SELECT v_order, p.id, x.q FROM public.products p
    JOIN (VALUES ('TXF-CM589', 20), ('TXF-RT003', 15)) AS x(code, q) ON x.code = p.code
    WHERE p.company_id = v_loja_id;
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_order, v_user, 'SUGERIDA', 'SEED-OP1'), (v_order, v_user, 'APROVADA', 'SEED-OP1'),
           (v_order, v_user, 'RESERVADA', 'SEED-OP1'), (v_order, v_user, 'SEPARAÇÃO', 'SEED-OP1');
  END IF;

  -- OP2: Loja 2 -> Loja 1 EM TRÂNSITO (botina parada na Loja 2 a caminho)
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_orders WHERE notes = 'SEED-OP2') THEN
    INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes, shipped_at)
    VALUES (v_loja_id, v_loja2, v_loja, 'EM TRÂNSITO', v_user, 'SEED-OP2', now()) RETURNING id INTO v_order;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty, shipped_qty)
    SELECT v_order, p.id, 10, 10 FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = 'TXF-BOT62030A';
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_order, v_user, 'SUGERIDA', 'SEED-OP2'), (v_order, v_user, 'APROVADA', 'SEED-OP2'),
           (v_order, v_user, 'RESERVADA', 'SEED-OP2'), (v_order, v_user, 'SEPARAÇÃO', 'SEED-OP2'),
           (v_order, v_user, 'CONFERÊNCIA', 'SEED-OP2'), (v_order, v_user, 'EXPEDIDA', 'SEED-OP2'),
           (v_order, v_user, 'EM TRÂNSITO', 'SEED-OP2');
    INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    SELECT v_loja_id, v_loja2, p.id, p.code, p.name, 10, 'out', 'transfer_out', 'VAREJO_PDV',
           v_order::text, 'SEED-OP2 expedição Loja 2 -> Loja 1', v_user::text, 'stock_transfer'
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-BOT62030A';
  END IF;

  -- OP3: CD -> Loja 2 SUGERIDA (aguardando o gestor na fila)
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_orders WHERE notes = 'SEED-OP3') THEN
    INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes)
    VALUES (v_loja_id, v_cd, v_loja2, 'SUGERIDA', v_user, 'SEED-OP3') RETURNING id INTO v_order;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty)
    SELECT v_order, p.id, 12 FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = 'TXF-CM485';
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_order, v_user, 'SUGERIDA', 'SEED-OP3');
  END IF;

  -- OP4: CD -> Loja 1 RECEBIDA COM DIVERGÊNCIA (20 expedidas, 18 recebidas)
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_orders WHERE notes = 'SEED-OP4') THEN
    INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes, shipped_at, received_at)
    VALUES (v_loja_id, v_cd, v_loja, 'RECEBIDA COM DIVERGÊNCIA', v_user, 'SEED-OP4', now(), now()) RETURNING id INTO v_order;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty, shipped_qty, received_qty)
    SELECT v_order, p.id, 20, 20, 18 FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = 'TXF-CIF071';
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, quantity, divergence, notes)
    VALUES (v_order, v_user, 'SUGERIDA', 0, 0, 'SEED-OP4'), (v_order, v_user, 'APROVADA', 0, 0, 'SEED-OP4'),
           (v_order, v_user, 'EXPEDIDA', 20, 0, 'SEED-OP4'),
           (v_order, v_user, 'RECEBIDA COM DIVERGÊNCIA', 18, 2, 'SEED-OP4 faltaram 2 un na conferência');
    INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    SELECT v_loja_id, v_cd, p.id, p.code, p.name, 20, 'out', 'transfer_out', 'VAREJO_PDV',
           v_order::text, 'SEED-OP4 expedição CD -> Loja 1', v_user::text, 'stock_transfer'
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-CIF071';
    INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    SELECT v_loja_id, v_loja, p.id, p.code, p.name, 18, 'in', 'transfer_in', 'VAREJO_PDV',
           v_order::text, 'SEED-OP4 recebimento Loja 1 (18 de 20)', v_user::text, 'stock_transfer'
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-CIF071';
  END IF;

  -- OP5: CD -> Loja 1 ENCERRADA (histórico completo, CM639 sai do zero)
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_orders WHERE notes = 'SEED-OP5') THEN
    INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes, shipped_at, received_at)
    VALUES (v_loja_id, v_cd, v_loja, 'ENCERRADA', v_user, 'SEED-OP5', now(), now()) RETURNING id INTO v_order;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty, shipped_qty, received_qty)
    SELECT v_order, p.id, 10, 10, 10 FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = 'TXF-CM639';
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_order, v_user, 'SUGERIDA', 'SEED-OP5'), (v_order, v_user, 'APROVADA', 'SEED-OP5'),
           (v_order, v_user, 'EXPEDIDA', 'SEED-OP5'), (v_order, v_user, 'RECEBIDA', 'SEED-OP5'),
           (v_order, v_user, 'ENCERRADA', 'SEED-OP5');
    INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    SELECT v_loja_id, v_cd, p.id, p.code, p.name, 10, 'out', 'transfer_out', 'VAREJO_PDV',
           v_order::text, 'SEED-OP5 expedição CD -> Loja 1', v_user::text, 'stock_transfer'
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-CM639';
    INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    SELECT v_loja_id, v_loja, p.id, p.code, p.name, 10, 'in', 'transfer_in', 'VAREJO_PDV',
           v_order::text, 'SEED-OP5 recebimento Loja 1', v_user::text, 'stock_transfer'
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-CM639';
  END IF;

  -- Solicitação → de abastecimento PENDENTE (análise Loja x CD x fábrica)
  IF NOT EXISTS (SELECT 1 FROM public.supply_requests WHERE notes = 'SEED-OP') THEN
    INSERT INTO public.supply_requests (company_id, requester_branch_id, product_id, product_code, product_name, quantity, notes, created_by)
    SELECT v_loja_id, v_loja, p.id, p.code, p.name, 6, 'SEED-OP', v_user
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-BOT87060';
  END IF;

  -- Pedido intercompany PENDENTE (fila de decisão do gestor da indústria)
  IF NOT EXISTS (SELECT 1 FROM public.intercompany_replenishment_requests WHERE notes = 'SEED-OP') THEN
    INSERT INTO public.intercompany_replenishment_requests (
      group_root_company_id, requesting_company_id, requesting_branch_id,
      product_id, product_code, product_name, unit, quantity, notes, created_by
    )
    SELECT (SELECT parent_company_id FROM public.companies WHERE id = v_loja_id),
           v_loja_id, v_loja, p.id, p.code, p.name, 'un', 30, 'SEED-OP', v_user
    FROM public.products p WHERE p.company_id = v_loja_id AND p.code = 'TXF-CP009';
  END IF;

  -- Alertas operacionais da Central da Loja
  INSERT INTO public.operational_tasks (company_id, branch_id, title, description, priority, status, category)
  SELECT v_loja_id, v_loja, 'Ruptura: CAMISETA CM639 abaixo do mínimo', 'Solicitar abastecimento — há saldo parado na Loja 2 (remanejo).', 'critical', 'pending', 'rupture'
  WHERE NOT EXISTS (SELECT 1 FROM public.operational_tasks WHERE company_id = v_loja_id AND title LIKE 'Ruptura: CAMISETA CM639%');
  INSERT INTO public.operational_tasks (company_id, branch_id, title, description, priority, status, category)
  SELECT v_loja_id, v_loja, 'Conferir recebimento em trânsito', 'Botina 62030 Areia (10 un) vindo da Loja 2 — conferir e lançar divergência se houver.', 'high', 'pending', 'receiving'
  WHERE NOT EXISTS (SELECT 1 FROM public.operational_tasks WHERE company_id = v_loja_id AND title LIKE 'Conferir recebimento em trânsito%');

  RAISE NOTICE 'Dia operacional das lojas populado (OP1-OP5, abastecimento, intercompany, alertas).';
END $$;

COMMIT;
