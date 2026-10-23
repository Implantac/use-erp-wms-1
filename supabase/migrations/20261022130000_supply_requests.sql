-- ============================================================================
-- Solicitação de abastecimento + análise dos almoxarifados (grupo de lojas)
--
-- Problema prático: a Loja pedia reposição já escolhendo a origem, e ninguém
-- analisava de onde a peça deveria sair. Agora:
--   1) a Loja cria uma SOLICITAÇÃO DE ABASTECIMENTO (sem origem definida);
--   2) o almoxarifado/gestor abre a ANÁLISE e vê os saldos candidatos do
--      grupo inteiro (outra Loja com saldo parado, CD Loja, fábrica);
--   3) ao decidir, o sistema gera o fluxo oficial já existente:
--        - origem Loja/CD (mesma empresa): transferência entre unidades
--          criada e APROVADA (mesmas tabelas, logs e GUC da RPC oficial);
--        - origem FÁBRICA (empresa-raiz): solicitação intercompany, que
--          segue para a fila de decisão do gestor da indústria;
--      nenhum segundo ledger: tudo continua em stock_movements.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requester_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'ATENDIDA', 'REJEITADA', 'CANCELADA')),
  decided_source_kind text
    CHECK (decided_source_kind IN ('LOJA', 'CD', 'FABRICA')),
  decided_source_company_id uuid REFERENCES public.companies(id),
  decided_source_branch_id uuid REFERENCES public.branches(id),
  transfer_order_id uuid,
  intercompany_request_id uuid,
  notes text,
  created_by uuid,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supply_requests_company_status
  ON public.supply_requests (company_id, status, created_at DESC);

ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_requests_select ON public.supply_requests;
CREATE POLICY supply_requests_select ON public.supply_requests
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id = supply_requests.company_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = public.company_group_root(supply_requests.company_id)
    )
  );

-- Autorização de gestor do grupo (Loja ou indústria), reusada pelas RPCs.
CREATE OR REPLACE FUNCTION public.is_group_manager(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_system_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'manager')
      AND ur.company_id IN (
        p_company_id,
        public.company_group_root(p_company_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_group_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_manager(uuid) TO authenticated, service_role;

-- 1) Loja solicita abastecimento (sem origem: quem decide é a análise) ------
CREATE OR REPLACE FUNCTION public.create_supply_request(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_system_admin(auth.uid())
    OR public.get_user_company_id(auth.uid()) = v_branch.company_id
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = v_branch.company_id)
  ) THEN
    RAISE EXCEPTION 'Você não pertence à empresa desta unidade' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND company_id = v_branch.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não pertence à empresa da unidade' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.supply_requests (
    company_id, requester_branch_id, product_id, product_code, product_name,
    quantity, notes, created_by
  ) VALUES (
    v_branch.company_id, p_branch_id, p_product_id, v_product.code,
    v_product.name, p_quantity, p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'PENDENTE');
END;
$$;
REVOKE ALL ON FUNCTION public.create_supply_request(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supply_request(uuid, uuid, numeric, text) TO authenticated, service_role;

-- 2) Candidatos de origem: saldos do grupo para o item -----------------------
CREATE OR REPLACE FUNCTION public.supply_candidates(p_supply_request_id uuid)
RETURNS TABLE (
  source_kind text,
  company_id uuid,
  company_name text,
  branch_id uuid,
  branch_name text,
  quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.supply_requests%ROWTYPE;
  v_root uuid;
BEGIN
  SELECT * INTO v_req FROM public.supply_requests WHERE id = p_supply_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_system_admin(auth.uid())
    OR public.get_user_company_id(auth.uid()) = v_req.company_id
    OR public.is_group_manager(v_req.company_id)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta solicitação' USING ERRCODE = '42501';
  END IF;
  v_root := public.company_group_root(v_req.company_id);

  RETURN QUERY
  -- Unidades da própria empresa da Loja (CD e outras lojas)
  SELECT
    CASE WHEN b.tipo = 'cd' THEN 'CD' ELSE 'LOJA' END,
    b.company_id, c.name, b.id, b.name,
    COALESCE(sum(sb.quantity - sb.reserved_qty), 0)::numeric
  FROM public.branches b
  JOIN public.companies c ON c.id = b.company_id
  JOIN public.products p ON p.company_id = b.company_id AND p.code = v_req.product_code
  LEFT JOIN public.stock_balances sb
    ON sb.company_id = b.company_id AND sb.branch_id = b.id AND sb.product_id = p.id
  WHERE b.company_id = v_req.company_id
    AND b.id <> v_req.requester_branch_id
    AND COALESCE(b.is_active, true)
  GROUP BY b.tipo, b.company_id, c.name, b.id, b.name
  UNION ALL
  -- Fábrica (empresa-raiz do grupo), casando o produto pelo código
  SELECT
    'FABRICA',
    b.company_id, c.name, b.id, b.name,
    COALESCE(sum(sb.quantity - sb.reserved_qty), 0)::numeric
  FROM public.branches b
  JOIN public.companies c ON c.id = b.company_id
  JOIN public.products p ON p.company_id = b.company_id AND p.code = v_req.product_code
  LEFT JOIN public.stock_balances sb
    ON sb.company_id = b.company_id AND sb.branch_id = b.id AND sb.product_id = p.id
  WHERE v_root IS NOT NULL AND v_root <> v_req.company_id
    AND b.company_id = v_root
    AND COALESCE(b.is_active, true)
  GROUP BY b.company_id, c.name, b.id, b.name;
END;
$$;
REVOKE ALL ON FUNCTION public.supply_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_candidates(uuid) TO authenticated, service_role;

-- 3) Decisão do almoxarifado: gera o fluxo oficial conforme a origem --------
CREATE OR REPLACE FUNCTION public.decide_supply_request(
  p_supply_request_id uuid,
  p_source_kind text,
  p_source_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.supply_requests%ROWTYPE;
  v_source public.branches%ROWTYPE;
  v_root uuid;
  v_root_product public.products%ROWTYPE;
  v_transfer_id uuid;
  v_inter_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.supply_requests
  WHERE id = p_supply_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Solicitação já decidida (%)', v_req.status USING ERRCODE = '55000';
  END IF;
  IF NOT public.is_group_manager(v_req.company_id) THEN
    RAISE EXCEPTION 'A análise de abastecimento é decisão do gestor/almoxarifado'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_kind = 'REJEITAR' THEN
    UPDATE public.supply_requests
    SET status = 'REJEITADA', decided_by = auth.uid(), decided_at = now()
    WHERE id = v_req.id;
    RETURN jsonb_build_object('id', v_req.id, 'status', 'REJEITADA');
  END IF;

  IF p_source_kind NOT IN ('LOJA', 'CD', 'FABRICA') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_source_kind USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_source FROM public.branches WHERE id = p_source_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de origem não encontrada' USING ERRCODE = 'P0002';
  END IF;
  v_root := public.company_group_root(v_req.company_id);

  IF p_source_kind IN ('LOJA', 'CD') THEN
    IF v_source.company_id <> v_req.company_id THEN
      RAISE EXCEPTION 'Origem % precisa ser unidade da mesma empresa', p_source_kind
        USING ERRCODE = '22023';
    END IF;
    IF v_source.id = v_req.requester_branch_id THEN
      RAISE EXCEPTION 'Origem e destino devem ser unidades diferentes'
        USING ERRCODE = '22023';
    END IF;
    -- Mesmo caminho da RPC oficial de transferências: GUC sancionada,
    -- ordem SUGERIDA + item + log, e aprovação do gestor na sequência.
    PERFORM set_config('app.stock_transfer_rpc', 'on', true);
    INSERT INTO public.stock_transfer_orders (
      company_id, origin_unit_id, destination_unit_id, current_status,
      requested_by, notes
    ) VALUES (
      v_req.company_id, v_source.id, v_req.requester_branch_id, 'SUGERIDA',
      v_req.created_by,
      'Abastecimento ' || v_req.id::text || ' — origem definida na análise ('
        || p_source_kind || ')'
    ) RETURNING id INTO v_transfer_id;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty)
    VALUES (v_transfer_id, v_req.product_id, v_req.quantity);
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_transfer_id, v_req.created_by, 'SUGERIDA',
            'Solicitação → de abastecimento');
    UPDATE public.stock_transfer_orders
    SET current_status = 'APROVADA'
    WHERE id = v_transfer_id;
    INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
    VALUES (v_transfer_id, auth.uid(), 'APROVADA',
            'Aprovada na análise de abastecimento (origem: ' || v_source.name || ')');

    UPDATE public.supply_requests
    SET status = 'ATENDIDA', decided_source_kind = p_source_kind,
        decided_source_company_id = v_source.company_id,
        decided_source_branch_id = v_source.id,
        transfer_order_id = v_transfer_id,
        decided_by = auth.uid(), decided_at = now()
    WHERE id = v_req.id;
    RETURN jsonb_build_object('id', v_req.id, 'status', 'ATENDIDA',
                              'transfer_order_id', v_transfer_id);
  END IF;

  -- FÁBRICA: vira solicitação intercompany para a fila do gestor da indústria
  IF v_root IS NULL OR v_root = v_req.company_id OR v_source.company_id <> v_root THEN
    RAISE EXCEPTION 'Origem FÁBRICA precisa ser unidade da empresa-raiz do grupo'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_root_product FROM public.products
  WHERE company_id = v_root AND code = v_req.product_code LIMIT 1;

  INSERT INTO public.intercompany_replenishment_requests (
    group_root_company_id, requesting_company_id, requesting_branch_id,
    product_id, product_code, product_name, unit, quantity, notes, created_by
  )
  SELECT
    v_root, v_req.company_id, v_req.requester_branch_id,
    v_req.product_id, v_req.product_code, v_req.product_name,
    COALESCE(v_root_product.unit, 'un'), v_req.quantity,
    'Abastecimento ' || v_req.id::text || ' — origem definida na análise (FÁBRICA: '
      || v_source.name || ')',
    auth.uid()
  RETURNING id INTO v_inter_id;

  UPDATE public.supply_requests
  SET status = 'ATENDIDA', decided_source_kind = 'FABRICA',
      decided_source_company_id = v_source.company_id,
      decided_source_branch_id = v_source.id,
      intercompany_request_id = v_inter_id,
      decided_by = auth.uid(), decided_at = now()
  WHERE id = v_req.id;
  RETURN jsonb_build_object('id', v_req.id, 'status', 'ATENDIDA',
                            'intercompany_request_id', v_inter_id);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_supply_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_supply_request(uuid, text, uuid) TO authenticated, service_role;
