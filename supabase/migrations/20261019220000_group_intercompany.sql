-- ============================================================================
-- Grupo multiempresa (CNPJs diferentes) — Fase "indústria + lojas próprias".
--
-- Contexto: com lojas como FILIAIS (mesmo CNPJ), o sistema já opera com
-- branches + transferencias_canal. Com lojas como EMPRESAS do mesmo grupo
-- (CNPJs distintos), faltava: (1) o gestor enxergar o estoque do grupo
-- inteiro; (2) a loja-empresa solicitar reposição à indústria; (3) a
-- indústria decidir e transformar a solicitação em VENDA intercompany
-- (fiscalmente correto entre CNPJs) ou mandar produzir.
--
-- Desenho (incremental, sobre o que já existe):
--  * Grupo = árvore `companies.parent_company_id` com raiz na indústria;
--    `company_group_root()` resolve a raiz. `get_consolidated_company_ids`
--    (já existente) lista o grupo a partir da raiz.
--  * `group_stock_overview()`: matriz produto × empresa do grupo inteiro,
--    só para admin/manager de empresa do grupo (SECURITY DEFINER com
--    checagem explícita — nunca vaza para fora do grupo).
--  * `intercompany_replenishment_requests`: solicitação da loja-empresa.
--    Decisão da indústria (`decide_intercompany_request`):
--      - vender / transferir_cd -> cria pedido de venda na indústria com a
--        loja como cliente (casando o produto por CÓDIGO); a expedição usa
--        o fluxo WMS já homologado e o financeiro nasce do pedido;
--      - remanejar -> o pedido nasce na loja-origem (empresa indicada),
--        vendendo para a loja solicitante;
--      - produzir -> status `producao_solicitada` (o gestor abre o PCP/MRP,
--        que já gera OP sem duplicar);
--      - rejeitar -> status `rejeitada`.
--    Recebimento (`receive_intercompany_delivery`): a loja confere e o
--    estoque entra pelo MESMO ledger (`stock_movements`) das demais
--    movimentações — sem segundo livro.
--  * Escrita nas tabelas só via RPC; leitura (RLS) restrita às empresas
--    envolvidas (solicitante ou raiz do grupo).
--
-- Rollback manual: dropar as funções e a tabela desta migration; nada mais
-- é alterado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.company_group_root(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current uuid := p_company_id;
  v_parent uuid;
  v_guard int := 0;
BEGIN
  IF v_current IS NULL THEN RETURN NULL; END IF;
  LOOP
    SELECT parent_company_id INTO v_parent FROM public.companies WHERE id = v_current;
    EXIT WHEN v_parent IS NULL OR v_guard >= 20;
    v_current := v_parent;
    v_guard := v_guard + 1;
  END LOOP;
  RETURN v_current;
END;
$$;
REVOKE ALL ON FUNCTION public.company_group_root(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_group_root(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.intercompany_replenishment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_root_company_id uuid NOT NULL REFERENCES public.companies(id),
  requesting_company_id uuid NOT NULL REFERENCES public.companies(id),
  requesting_branch_id uuid REFERENCES public.branches(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_code text NOT NULL,
  product_name text NOT NULL,
  unit text,
  quantity numeric NOT NULL CHECK (quantity > 0),
  received_quantity numeric,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'aprovada', 'producao_solicitada', 'rejeitada', 'recebida', 'cancelada'
  )),
  decision text CHECK (decision IN ('vender', 'transferir_cd', 'remanejar', 'produzir', 'rejeitar')),
  source_company_id uuid REFERENCES public.companies(id),
  sales_order_id uuid REFERENCES public.orders(id),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intercompany_replenishment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intercompany_requests_select ON public.intercompany_replenishment_requests;
CREATE POLICY intercompany_requests_select ON public.intercompany_replenishment_requests
  FOR SELECT TO authenticated
  USING (
    requesting_company_id = public.get_user_company_id(auth.uid())
    OR group_root_company_id = public.get_user_company_id(auth.uid())
    OR source_company_id = public.get_user_company_id(auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.intercompany_replenishment_requests FROM authenticated, anon;
GRANT SELECT ON public.intercompany_replenishment_requests TO authenticated;

-- Estoque do grupo inteiro para o gestor (matriz produto x empresa).
CREATE OR REPLACE FUNCTION public.group_stock_overview(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_code text,
  product_name text,
  quantity numeric,
  reserved_quantity numeric,
  min_stock numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_company uuid := public.get_user_company_id(auth.uid());
  v_base uuid := COALESCE(p_company_id, v_caller_company);
  v_root uuid;
BEGIN
  IF auth.uid() IS NULL OR v_caller_company IS NULL OR v_base IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  v_root := public.company_group_root(v_base);

  -- O grupo consultado precisa conter a empresa de quem chama...
  IF NOT EXISTS (
    SELECT 1 FROM public.get_consolidated_company_ids(v_root) g WHERE g.id = v_caller_company
  ) THEN
    RAISE EXCEPTION 'Você não pertence a este grupo de empresas' USING ERRCODE = '42501';
  END IF;
  -- ...e quem chama precisa ser gestor (admin/manager) na própria empresa.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.company_id = v_caller_company
      AND ur.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Visão do grupo é restrita a gestores (admin/manager)' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sb.company_id, c.name, sb.branch_id, b.name,
         sb.product_id, sb.product_code, sb.product_name,
         sb.quantity, COALESCE(sb.reserved_quantity, 0), COALESCE(p.min_stock, 0)
  FROM public.stock_balances sb
  JOIN public.companies c ON c.id = sb.company_id
  LEFT JOIN public.branches b ON b.id = sb.branch_id
  LEFT JOIN public.products p ON p.id = sb.product_id
  WHERE sb.company_id IN (SELECT g.id FROM public.get_consolidated_company_ids(v_root) g)
  ORDER BY sb.product_name, c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.group_stock_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_stock_overview(uuid) TO authenticated, service_role;

-- Loja-empresa solicita reposição à indústria do grupo.
CREATE OR REPLACE FUNCTION public.create_intercompany_replenishment_request(
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
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_product public.products%ROWTYPE;
  v_branch uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND OR v_product.company_id <> v_company THEN
    RAISE EXCEPTION 'Produto não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  IF v_root = v_company THEN
    RAISE EXCEPTION 'Sua empresa é a matriz do grupo (ou não pertence a um grupo): solicitação intercompany não se aplica' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(p.default_branch_id, p.branch_id) INTO v_branch
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches
    WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.intercompany_replenishment_requests (
    group_root_company_id, requesting_company_id, requesting_branch_id,
    product_id, product_code, product_name, unit, quantity, notes, created_by
  ) VALUES (
    v_root, v_company, v_branch,
    v_product.id, v_product.code, v_product.name, v_product.unit, p_quantity, p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'pendente', 'group_root_company_id', v_root);
END;
$$;
REVOKE ALL ON FUNCTION public.create_intercompany_replenishment_request(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_intercompany_replenishment_request(uuid, numeric, text) TO authenticated, service_role;

-- Gestor da indústria decide; vender/transferir/remanejar viram pedido.
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
  IF p_decision NOT IN ('vender', 'transferir_cd', 'remanejar', 'produzir', 'rejeitar') THEN
    RAISE EXCEPTION 'Decisão inválida: %', COALESCE(p_decision, '(nula)') USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'rejeitar' THEN
    UPDATE public.intercompany_replenishment_requests
       SET status = 'rejeitada', decision = 'rejeitar', decided_by = auth.uid(),
           decided_at = now(), updated_at = now()
     WHERE id = v_req.id;
    RETURN jsonb_build_object('id', v_req.id, 'status', 'rejeitada');
  END IF;

  IF p_decision = 'produzir' THEN
    UPDATE public.intercompany_replenishment_requests
       SET status = 'producao_solicitada', decision = 'produzir', decided_by = auth.uid(),
           decided_at = now(), updated_at = now()
     WHERE id = v_req.id;
    RETURN jsonb_build_object('id', v_req.id, 'status', 'producao_solicitada',
      'hint', 'Abra o PCP/MRP da indústria para gerar a ordem de produção; a solicitação fica rastreada aqui.');
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

-- Loja confere a entrega: estoque entra pelo ledger único.
CREATE OR REPLACE FUNCTION public.receive_intercompany_delivery(
  p_request_id uuid,
  p_quantity numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_company uuid := public.get_user_company_id(auth.uid());
  v_req public.intercompany_replenishment_requests%ROWTYPE;
  v_qty numeric;
  v_branch uuid;
BEGIN
  SELECT * INTO v_req FROM public.intercompany_replenishment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_caller_company IS DISTINCT FROM v_req.requesting_company_id THEN
    RAISE EXCEPTION 'Apenas a loja solicitante confirma o recebimento' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'aprovada' THEN
    RAISE EXCEPTION 'Solicitação não está aprovada para recebimento (status %)', v_req.status USING ERRCODE = '55000';
  END IF;

  v_qty := COALESCE(p_quantity, v_req.quantity);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade recebida deve ser maior que zero' USING ERRCODE = '22023';
  END IF;

  v_branch := v_req.requesting_branch_id;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches
    WHERE company_id = v_req.requesting_company_id ORDER BY created_at LIMIT 1;
  END IF;

  -- Saldo e derivado do ledger: o trigger apply_stock_movement_to_balance
  -- atualiza stock_balances a partir deste lancamento (nunca direto).
  INSERT INTO public.stock_movements (
    company_id, branch_id, product_id, product_code, product_name, quantity,
    direction, type, canal_operacional, reference, notes, operator, source
  ) VALUES (
    v_req.requesting_company_id, v_branch, v_req.product_id, v_req.product_code, v_req.product_name,
    v_qty, 'in', 'intercompany_in', 'VAREJO_PDV', v_req.id::text,
    'Recebimento intercompany (solicitação ' || left(v_req.id::text, 8) || ')',
    auth.uid()::text, 'intercompany'
  );

  UPDATE public.intercompany_replenishment_requests
     SET status = 'recebida', received_quantity = v_qty, received_at = now(), updated_at = now()
   WHERE id = v_req.id;

  RETURN jsonb_build_object('id', v_req.id, 'status', 'recebida', 'received_quantity', v_qty);
END;
$$;
REVOKE ALL ON FUNCTION public.receive_intercompany_delivery(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_intercompany_delivery(uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- REPARO (achado do ensaio): `fn_transferencia_canal_apply` gravava
-- `stock_movements.movement_type`, coluna que deixou de existir quando o
-- ledger migrou para `type`/`direction`. Resultado: TODA transferência
-- entre filiais (transferencias_canal) falhava ao mudar de status.
-- Redefinimos a função no contrato atual: ela apenas lança os movimentos
-- (out na origem, in no destino) e o trigger
-- `apply_stock_movement_to_balance` move os saldos — um ledger só.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_transferencia_canal_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE it record;
BEGIN
  IF NEW.status = 'em_transito' AND (OLD.status IS DISTINCT FROM 'em_transito') THEN
    FOR it IN
      SELECT ti.product_id, ti.quantidade, p.code, p.name
        FROM public.transferencias_canal_itens ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transferencia_id = NEW.id
    LOOP
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        NEW.company_id, NEW.origem_branch_id, it.product_id, it.code, it.name, it.quantidade,
        'out', 'transfer_out', NEW.canal_origem, NEW.numero,
        'Transferência canal ' || NEW.numero || ' (saída)', COALESCE(auth.uid()::text, 'system'), 'transferencia_canal'
      );
    END LOOP;
  END IF;

  IF NEW.status = 'recebido' AND (OLD.status IS DISTINCT FROM 'recebido') THEN
    NEW.confirmed_at := now();
    FOR it IN
      SELECT ti.product_id, ti.quantidade, ti.quantidade_recebida, p.code, p.name
        FROM public.transferencias_canal_itens ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transferencia_id = NEW.id
    LOOP
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        NEW.company_id, NEW.destino_branch_id, it.product_id, it.code, it.name,
        COALESCE(it.quantidade_recebida, it.quantidade),
        'in', 'transfer_in', NEW.canal_destino, NEW.numero,
        'Transferência canal ' || NEW.numero || ' (recebimento)', COALESCE(auth.uid()::text, 'system'), 'transferencia_canal'
      );
    END LOOP;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
