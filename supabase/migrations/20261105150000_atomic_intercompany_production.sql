-- ============================================================================
-- P0-03 — produzir solicitação intercompany e criar/vincular OP atomicamente
--
-- Antes, o navegador gravava a decisão, consultava o produto e chamava o PCP
-- em três operações independentes. Uma falha intermediária deixava a loja em
-- `producao_solicitada` sem OP. A decisão e a OP agora pertencem à mesma
-- transação no banco; a RPC oficial do PCP continua sendo a única dona das
-- regras de BOM, roteiro, etapas, numeração e snapshot técnico.
--
-- Não há backfill especulativo: solicitações antigas sem OP aparecem na caixa
-- da fábrica como pendência de conciliação, sem inventar um vínculo ou gerar
-- uma segunda OP automaticamente. As demais decisões (vender, transferir_cd,
-- remanejar e rejeitar) permanecem inalteradas.
-- ============================================================================

ALTER TABLE public.intercompany_replenishment_requests
  ADD COLUMN IF NOT EXISTS production_order_id uuid
    REFERENCES public.production_orders(id);

CREATE UNIQUE INDEX IF NOT EXISTS intercompany_requests_production_order_uidx
  ON public.intercompany_replenishment_requests (production_order_id)
  WHERE production_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS intercompany_requests_root_production_idx
  ON public.intercompany_replenishment_requests (group_root_company_id, status, decided_at DESC)
  WHERE status = 'producao_solicitada';

CREATE OR REPLACE FUNCTION public.produce_intercompany_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_req public.intercompany_replenishment_requests%ROWTYPE;
  v_product_id uuid;
  v_requester_name text;
  v_key text;
  v_rpc_result jsonb;
  v_order public.production_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Solicitação é obrigatória' USING ERRCODE = '22023';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  -- Serializa retries e chamadas concorrentes da MESMA solicitação. A segunda
  -- transação só prossegue após o commit da primeira e enxerga o vínculo.
  SELECT * INTO v_req
    FROM public.intercompany_replenishment_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_company_id IS DISTINCT FROM v_req.group_root_company_id OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_user_id
       AND ur.company_id = v_req.group_root_company_id
       AND ur.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Produção restrita a gestores da indústria raiz do grupo'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status = 'producao_solicitada' THEN
    IF v_req.production_order_id IS NULL THEN
      RAISE EXCEPTION 'Solicitação legada sem OP vinculada; faça a conciliação antes de qualquer nova tentativa'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_order
      FROM public.production_orders
     WHERE id = v_req.production_order_id
       AND company_id = v_req.group_root_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OP vinculada não pertence à indústria; conciliação obrigatória'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_req.id,
      'status', v_req.status,
      'production_order_id', v_order.id,
      'order_number', v_order.order_number,
      'production_order_status', v_order.status,
      'idempotent_replay', true
    );
  END IF;

  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação já decidida ou encerrada (status=%)', v_req.status
      USING ERRCODE = '55000';
  END IF;

  SELECT p.id INTO v_product_id
    FROM public.products p
   WHERE p.company_id = v_req.group_root_company_id
     AND p.code = v_req.product_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não existe no cadastro da indústria; nenhuma decisão ou OP foi gravada',
      v_req.product_code USING ERRCODE = '22023';
  END IF;

  SELECT c.name INTO v_requester_name
    FROM public.companies c
   WHERE c.id = v_req.requesting_company_id;

  -- UUID completo: os oito primeiros caracteres não são uma chave segura de
  -- idempotência. O prefixo também separa este fluxo de outras criações de OP.
  v_key := 'intercompany-request-' || v_req.id::text;

  -- Não duplicar regras do PCP: esta RPC valida empresa/permissão, BOM, roteiro
  -- ativo, operações, cria etapas, numera e congela o snapshot técnico.
  v_rpc_result := public.create_textile_production_order(
    v_product_id,
    v_req.quantity,
    v_key,
    'medium',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_requester_name,
    '{}'::jsonb
  );

  -- Uma OP preexistente com a mesma chave só pode ser reutilizada se realmente
  -- representar esta solicitação. Isso impede vínculo com uma OP de outro
  -- produto/quantidade criada manualmente com uma chave forjada.
  SELECT * INTO v_order
    FROM public.production_orders
   WHERE id = NULLIF(v_rpc_result ->> 'production_order_id', '')::uuid
     AND company_id = v_req.group_root_company_id
     AND product_id = v_product_id
     AND quantity = v_req.quantity
     AND creation_idempotency_key = v_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A OP idempotente não corresponde ao produto/quantidade da solicitação; transação revertida'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.intercompany_replenishment_requests
     SET status = 'producao_solicitada',
         decision = 'produzir',
         production_order_id = v_order.id,
         decided_by = v_user_id,
         decided_at = now(),
         updated_at = now()
   WHERE id = v_req.id
     AND status = 'pendente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A solicitação mudou durante a criação da OP; transação revertida'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'id', v_req.id,
    'status', 'producao_solicitada',
    'production_order_id', v_order.id,
    'order_number', v_order.order_number,
    'production_order_status', v_order.status,
    'idempotent_replay', COALESCE((v_rpc_result ->> 'idempotent_replay')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.produce_intercompany_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_intercompany_request(uuid)
  TO authenticated, service_role;

-- Mantém compatibilidade com integrações existentes sem preservar o caminho
-- não atômico. `produzir` delega integralmente à RPC transacional; o restante
-- deste corpo é o fluxo vigente de pedido intercompany, sem alteração de regra.
CREATE OR REPLACE FUNCTION public.decide_intercompany_request(
  p_request_id uuid,
  p_decision text,
  p_source_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_company uuid := public.get_user_company_id(auth.uid());
  v_req public.intercompany_replenishment_requests%ROWTYPE;
  v_seller uuid;
  v_seller_product public.products%ROWTYPE;
  v_client_id uuid;
  v_requesting public.companies%ROWTYPE;
  v_order_id uuid;
  v_number text;
BEGIN
  IF p_decision = 'produzir' THEN
    RETURN public.produce_intercompany_request(p_request_id);
  END IF;

  SELECT * INTO v_req FROM public.intercompany_replenishment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação já decidida (status %)', v_req.status USING ERRCODE = '55000';
  END IF;
  IF v_caller_company IS DISTINCT FROM v_req.group_root_company_id THEN
    RAISE EXCEPTION 'Apenas a indústria (matriz do grupo) decide a solicitação' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.company_id = v_caller_company
      AND ur.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Decisão restrita a gestores da indústria' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('vender', 'transferir_cd', 'remanejar', 'rejeitar') THEN
    RAISE EXCEPTION 'Decisão inválida: %', COALESCE(p_decision, '(nula)') USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'rejeitar' THEN
    UPDATE public.intercompany_replenishment_requests
       SET status = 'rejeitada', decision = 'rejeitar', decided_by = auth.uid(),
           decided_at = now(), updated_at = now()
     WHERE id = v_req.id;
    RETURN jsonb_build_object('id', v_req.id, 'status', 'rejeitada');
  END IF;

  -- vender / transferir_cd: vende a indústria. remanejar: vende a loja-origem.
  v_seller := CASE WHEN p_decision = 'remanejar' THEN p_source_company_id ELSE v_req.group_root_company_id END;
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Remanejar exige indicar a empresa de origem' USING ERRCODE = '22023';
  END IF;
  IF v_seller = v_req.requesting_company_id THEN
    RAISE EXCEPTION 'Origem e destino devem ser empresas diferentes' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_consolidated_company_ids(v_req.group_root_company_id) g WHERE g.id = v_seller
  ) THEN
    RAISE EXCEPTION 'Empresa de origem fora do grupo' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_seller_product FROM public.products
   WHERE company_id = v_seller AND code = v_req.product_code
   ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não cadastrado na empresa vendedora', v_req.product_code USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_requesting FROM public.companies WHERE id = v_req.requesting_company_id;

  SELECT id INTO v_client_id FROM public.clients
   WHERE company_id = v_seller
     AND regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g') =
         regexp_replace(coalesce(v_requesting.cnpj, ''), '[^0-9]', '', 'g')
     AND v_requesting.cnpj IS NOT NULL
   ORDER BY created_at LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, code, name, trade_name, document_type, document, email, phone)
    VALUES (v_seller, 'IC-' || left(v_req.id::text, 8), v_requesting.name, v_requesting.name, 'CNPJ', v_requesting.cnpj,
            COALESCE(NULLIF(v_requesting.email, ''), 'intercompany@grupo.local'),
            COALESCE(NULLIF(v_requesting.phone, ''), '0000000000'))
    RETURNING id INTO v_client_id;
  END IF;

  v_number := 'IC-' || to_char(now(), 'YYYYMMDD') || '-' || left(v_req.id::text, 6);
  INSERT INTO public.orders (
    company_id, number, client_id, client_name, date, subtotal, discount, shipping,
    total, payment_method, payment_condition, status, priority
  ) VALUES (
    v_seller, v_number, v_client_id, v_requesting.name, CURRENT_DATE,
    v_req.quantity * COALESCE(v_seller_product.sale_price, 0), 0, 0,
    v_req.quantity * COALESCE(v_seller_product.sale_price, 0), 'boleto', 'grupo', 'confirmed', 'high'
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, company_id, product_id, product_code, product_name, quantity, unit_price, discount, total
  ) VALUES (
    v_order_id, v_seller, v_seller_product.id, v_seller_product.code, v_seller_product.name,
    v_req.quantity, COALESCE(v_seller_product.sale_price, 0), 0,
    v_req.quantity * COALESCE(v_seller_product.sale_price, 0)
  );

  UPDATE public.intercompany_replenishment_requests
     SET status = 'aprovada', decision = p_decision, source_company_id = v_seller,
         sales_order_id = v_order_id, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   WHERE id = v_req.id;

  RETURN jsonb_build_object('id', v_req.id, 'status', 'aprovada', 'sales_order_id', v_order_id,
    'seller_company_id', v_seller, 'order_number', v_number);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_intercompany_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_intercompany_request(uuid, text, uuid) TO authenticated, service_role;

-- Expõe o resultado real da decisão, inclusive registros legados inconsistentes,
-- sem transformar OPs concluídas/em andamento em contadores de pendências.
CREATE OR REPLACE FUNCTION public.factory_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  v_root := public.company_group_root(v_company);
  IF NOT (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = v_root
        AND ur.role IN ('admin', 'manager')
    )
  ) THEN
    RAISE EXCEPTION 'Caixa de entrada restrita aos gestores da indústria'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'group_root_company_id', v_root,
    'supply', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.created_at DESC)
      FROM (
        SELECT
          sr.id, sr.company_id, c.name AS company_name,
          sr.requester_branch_id, b.name AS branch_name,
          sr.product_id, sr.product_code, sr.product_name,
          sr.quantity, sr.status, sr.created_at
        FROM public.supply_requests sr
        JOIN public.companies c ON c.id = sr.company_id
        LEFT JOIN public.branches b ON b.id = sr.requester_branch_id
        WHERE sr.status = 'PENDENTE'
          AND (sr.company_id = v_root OR c.parent_company_id = v_root)
        ORDER BY sr.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'intercompany', COALESCE((
      SELECT jsonb_agg(y ORDER BY y.created_at DESC)
      FROM (
        SELECT
          ir.id, ir.requesting_company_id, c.name AS company_name,
          ir.requesting_branch_id, b.name AS branch_name,
          ir.product_code, ir.product_name, ir.quantity, ir.status, ir.created_at
        FROM public.intercompany_replenishment_requests ir
        JOIN public.companies c ON c.id = ir.requesting_company_id
        LEFT JOIN public.branches b ON b.id = ir.requesting_branch_id
        WHERE ir.group_root_company_id = v_root
          AND ir.status = 'pendente'
        ORDER BY ir.created_at DESC
        LIMIT 50
      ) y
    ), '[]'::jsonb),
    'production', COALESCE((
      SELECT jsonb_agg(z ORDER BY z.decided_at DESC NULLS LAST, z.created_at DESC)
      FROM (
        SELECT
          ir.id, ir.requesting_company_id, c.name AS company_name,
          ir.requesting_branch_id, b.name AS branch_name,
          ir.product_code, ir.product_name, ir.quantity, ir.status,
          ir.created_at, ir.decided_at, ir.production_order_id,
          po.order_number, po.status AS production_order_status
        FROM public.intercompany_replenishment_requests ir
        JOIN public.companies c ON c.id = ir.requesting_company_id
        LEFT JOIN public.branches b ON b.id = ir.requesting_branch_id
        LEFT JOIN public.production_orders po
          ON po.id = ir.production_order_id
         AND po.company_id = v_root
        WHERE ir.group_root_company_id = v_root
          AND ir.status = 'producao_solicitada'
        ORDER BY ir.decided_at DESC NULLS LAST, ir.created_at DESC
        LIMIT 20
      ) z
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.factory_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factory_inbox() TO authenticated, service_role;

COMMENT ON FUNCTION public.produce_intercompany_request(uuid) IS
  'Cria e vincula OP intercompany na mesma transação; replay por UUID completo e lock da solicitação.';
