-- LOJ-05A / contenção LOJ-06 — desenvolvimento isolado, NÃO homologado.
-- A versão sequencia a árvore recuperada; não é prova da data de execução.
--
-- Ação explícita do gestor: conclusão oficial -> pedido PENDENTE e hold do
-- lote produzido. Não conclui o ciclo, não emite documento, não lança saída.
-- WMS já debita saldo/lote na separação (direction='transfer' só audita).
-- Portanto nenhum segundo débito é criado aqui. O fiscal permanece fechado:
-- pedidos intercompany vinculados não podem separar/expedir por WMS nem
-- contornar o bloqueio alterando pedido/item/reserva diretamente.
--
-- Recebimento antigo é recusado: não há prova de entrega nesse contrato.
-- Não há backfill, promoção de legados, parâmetro de override ou habilitação
-- por ambiente. Expedição/recebimento/cancelamento exigem incremento próprio
-- e regras/homologação aprovadas pelo contador/provedor.
--
-- Rollback: primeiro reconciliar holds/documentos em janela autorizada.
-- Nunca apagar evidência nem restaurar o recebimento inseguro como rollback.

CREATE TABLE IF NOT EXISTS public.intercompany_production_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.intercompany_replenishment_requests(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  requesting_company_id uuid NOT NULL REFERENCES public.companies(id),
  requesting_branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id),
  completion_id uuid NOT NULL UNIQUE REFERENCES public.production_completion_requests(id),
  output_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  stock_balance_id uuid NOT NULL REFERENCES public.stock_balances(id),
  sales_order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.stock_reservations(id),
  quantity numeric NOT NULL,
  unit text NOT NULL,
  release_status text NOT NULL DEFAULT 'reservada_bloqueada_fiscal',
  released_by uuid NOT NULL REFERENCES public.profiles(id),
  released_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intercompany_release_quantity_check CHECK (
    quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  CONSTRAINT intercompany_release_companies_check CHECK (company_id <> requesting_company_id),
  CONSTRAINT intercompany_release_unit_check CHECK (length(btrim(unit)) > 0),
  -- Não é uma chave que possa ser ligada por um administrador na tela.
  CONSTRAINT intercompany_release_fiscal_closed_check CHECK (release_status = 'reservada_bloqueada_fiscal')
);

CREATE INDEX IF NOT EXISTS intercompany_releases_balance_idx
  ON public.intercompany_production_releases (stock_balance_id);
CREATE INDEX IF NOT EXISTS intercompany_releases_output_lot_idx
  ON public.intercompany_production_releases (output_lot_id);
CREATE INDEX IF NOT EXISTS intercompany_requests_sales_order_idx
  ON public.intercompany_replenishment_requests (sales_order_id) WHERE sales_order_id IS NOT NULL;

COMMENT ON TABLE public.intercompany_production_releases IS
  'Lastro da disponibilização gerencial de OP: pedido pendente e hold no estoque existente; não é ledger, expedição nem aprovação fiscal.';

ALTER TABLE public.intercompany_production_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intercompany_production_releases_select ON public.intercompany_production_releases;
CREATE POLICY intercompany_production_releases_select
  ON public.intercompany_production_releases FOR SELECT TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid()) AND (
      branch_id IS NULL OR public.get_user_branch_id(auth.uid()) IS NULL
      OR branch_id = public.get_user_branch_id(auth.uid()) OR public.is_matriz_viewer(auth.uid())
    ))
    OR
    (requesting_company_id = public.get_user_company_id(auth.uid()) AND (
      requesting_branch_id IS NULL OR public.get_user_branch_id(auth.uid()) IS NULL
      OR requesting_branch_id = public.get_user_branch_id(auth.uid()) OR public.is_matriz_viewer(auth.uid())
    ))
  );
-- Retirar também defaults eventualmente herdados do ambiente. Só a RPC
-- proprietária escreve; service_role não ganha uma rota para liberar fiscal.
REVOKE ALL ON public.intercompany_production_releases FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.intercompany_production_releases TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_intercompany_production(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_req public.intercompany_replenishment_requests%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_completion public.production_completion_requests%ROWTYPE;
  v_lot public.stock_lots%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_destination_product public.products%ROWTYPE;
  v_release public.intercompany_production_releases%ROWTYPE;
  v_balance public.stock_balances%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_destination_cnpj text;
  v_source_cnpj text;
  v_canal public.canal_operacional;
  v_count integer;
  v_movement_quantity numeric;
  v_sales_order_id uuid;
  v_order_item_id uuid;
  v_reservation_id uuid;
  v_number text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_user AND ur.company_id = v_company AND ur.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Disponibilização restrita a gestores da indústria raiz' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Solicitação é obrigatória' USING ERRCODE = '22023';
  END IF;

  -- Primeiro lock de toda chamada, inclusive replay/concorrência. A empresa
  -- participa do filtro antes de qualquer leitura privilegiada do pedido.
  SELECT * INTO v_req FROM public.intercompany_replenishment_requests
   WHERE id = p_request_id AND group_root_company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não pertence à indústria do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_req.decision IS DISTINCT FROM 'produzir' OR v_req.status <> 'producao_solicitada' THEN
    RAISE EXCEPTION 'Solicitação não está no caminho de produção elegível' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_release FROM public.intercompany_production_releases WHERE request_id = v_req.id;
  IF FOUND THEN
    -- Replay só retorna o lastro persistido, nunca refaz hold ou pedido.
    -- Vínculo corrompido não pode aparecer como sucesso idempotente.
    IF v_req.sales_order_id IS DISTINCT FROM v_release.sales_order_id
       OR v_req.production_order_id IS DISTINCT FROM v_release.production_order_id
       OR v_req.source_company_id IS DISTINCT FROM v_release.company_id
       OR v_req.quantity IS DISTINCT FROM v_release.quantity
       OR v_req.requesting_company_id IS DISTINCT FROM v_release.requesting_company_id
       OR v_req.requesting_branch_id IS DISTINCT FROM v_release.requesting_branch_id
       OR NOT EXISTS (
         SELECT 1 FROM public.orders o
         JOIN public.order_items i ON i.order_id = o.id
         JOIN public.stock_reservations r ON r.order_id = o.id AND r.order_item_id = i.id
         WHERE o.id = v_release.sales_order_id AND o.company_id = v_company AND o.status = 'pending'
           AND i.id = v_release.order_item_id AND i.company_id = v_company AND i.quantity = v_release.quantity
           AND r.id = v_release.reservation_id AND r.company_id = v_company
           AND r.product_id = i.product_id AND r.lot_id = v_release.output_lot_id
           AND r.reserved_qty = v_release.quantity AND r.picked_qty = 0 AND r.status = 'reserved'
       ) THEN
      RAISE EXCEPTION 'Lastro da disponibilização inconsistente; conciliação individual obrigatória' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'id', v_req.id, 'status', v_req.status, 'release_id', v_release.id,
      'release_status', v_release.release_status, 'production_order_id', v_release.production_order_id,
      'completion_id', v_release.completion_id, 'output_lot_id', v_release.output_lot_id,
      'sales_order_id', v_release.sales_order_id, 'reservation_id', v_release.reservation_id,
      'quantity', v_release.quantity, 'unit', v_release.unit,
      'dispatch_enabled', false, 'idempotent_replay', true
    );
  END IF;

  IF v_req.production_order_id IS NULL OR v_req.sales_order_id IS NOT NULL
     OR v_req.source_company_id IS NOT NULL OR COALESCE(v_req.received_quantity, 0) <> 0 THEN
    RAISE EXCEPTION 'Solicitação legada sem lastro íntegro; conciliação individual obrigatória' USING ERRCODE = '23514';
  END IF;
  IF v_req.quantity <= 0 OR v_req.quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Quantidade solicitada deve ser positiva e finita' USING ERRCODE = '22023';
  END IF;
  IF v_req.requesting_company_id = v_company
     OR public.company_group_root(v_req.requesting_company_id) IS DISTINCT FROM v_company
     OR public.company_group_root(v_company) IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Empresas não pertencem ao grupo intercompany válido' USING ERRCODE = '42501';
  END IF;
  IF v_req.requesting_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = v_req.requesting_branch_id AND company_id = v_req.requesting_company_id
  ) THEN
    RAISE EXCEPTION 'Unidade solicitante não pertence à empresa destino' USING ERRCODE = '42501';
  END IF;

  -- Reusa o autorizador/lock oficial do PCP, sem alterar a OP ou concluir por UPDATE.
  v_order := public.pcp_authorized_order(v_req.production_order_id);
  IF v_order.company_id <> v_company OR v_order.product_code <> v_req.product_code
     OR v_order.creation_idempotency_key IS DISTINCT FROM 'intercompany-request-' || v_req.id::text THEN
    RAISE EXCEPTION 'OP não corresponde à solicitação; conciliação obrigatória' USING ERRCODE = '23514';
  END IF;
  IF v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'A OP vinculada deve estar concluída pelo motor oficial' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_completion FROM public.production_completion_requests
   WHERE production_order_id = v_order.id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND OR v_completion.output_lot_id IS NULL
     OR v_completion.branch_id IS DISTINCT FROM v_order.branch_id
     OR v_completion.status <> 'completed'
     OR v_completion.produced_quantity IS DISTINCT FROM v_order.produced_quantity
     OR v_completion.produced_quantity < v_req.quantity
     OR v_completion.produced_quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Conclusão oficial/lote/quantidade não cobrem a solicitação; conciliação obrigatória' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_product FROM public.products
   WHERE id = v_order.product_id AND company_id = v_company FOR SHARE;
  IF NOT FOUND OR v_product.code <> v_req.product_code THEN
    RAISE EXCEPTION 'Produto produzido não corresponde à solicitação' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_destination_product FROM public.products
   WHERE id = v_req.product_id AND company_id = v_req.requesting_company_id FOR SHARE;
  IF NOT FOUND OR v_destination_product.code <> v_product.code THEN
    RAISE EXCEPTION 'Produto destino não corresponde ao produto produzido' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(v_req.unit), '') IS NULL
     OR lower(btrim(v_req.unit)) IS DISTINCT FROM lower(btrim(v_product.unit))
     OR lower(btrim(v_req.unit)) IS DISTINCT FROM lower(btrim(v_destination_product.unit))
     OR lower(btrim(v_req.unit)) IS DISTINCT FROM lower(btrim(v_order.unit)) THEN
    RAISE EXCEPTION 'Unidades de solicitação, OP e cadastros divergem; não presumir conversão' USING ERRCODE = '23514';
  END IF;
  IF v_product.sale_price IS NULL OR v_product.sale_price < 0
     OR v_product.sale_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Preço do cadastro deve ser não negativo e finito; pedido continuará pendente' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lot FROM public.stock_lots WHERE id = v_completion.output_lot_id FOR UPDATE;
  IF NOT FOUND OR v_lot.company_id <> v_company OR v_lot.product_id IS DISTINCT FROM v_product.id
     OR v_lot.product_code <> v_product.code OR v_lot.origin_type <> 'PRODUCAO'
     OR v_lot.origin_reference IS DISTINCT FROM v_order.order_number
     OR v_lot.status <> 'available' OR lower(COALESCE(v_lot.quality_status, '')) NOT IN ('approved', 'released')
     OR v_lot.remaining_qty < v_req.quantity OR v_lot.remaining_qty::text IN ('NaN', 'Infinity', '-Infinity')
     OR (v_lot.expiration_date IS NOT NULL AND v_lot.expiration_date < CURRENT_DATE) THEN
    RAISE EXCEPTION 'Lote produzido não está íntegro, liberado e disponível para esta solicitação' USING ERRCODE = '23514';
  END IF;
  v_canal := public.pcp_order_canal(v_order);
  SELECT count(*), sum(quantity) INTO v_count, v_movement_quantity FROM public.stock_movements
   WHERE company_id = v_company AND product_id = v_product.id AND lot_id = v_lot.id
     AND branch_id IS NOT DISTINCT FROM v_order.branch_id AND canal_operacional = v_canal
     AND type = 'production' AND direction = 'in' AND source = 'production_completion'
     AND document_number = 'PROD-' || v_order.order_number
     AND reference = 'production_order_id=' || v_order.id::text;
  IF v_count <> 1 OR v_movement_quantity IS DISTINCT FROM v_completion.produced_quantity THEN
    RAISE EXCEPTION 'Entrada oficial do lote não conciliada no ledger existente' USING ERRCODE = '23514';
  END IF;

  -- Não somar saldos de outros lotes/filiais ou escolher um FIFO mais antigo.
  SELECT count(*) INTO v_count FROM public.stock_balances
   WHERE company_id = v_company AND product_id = v_product.id AND lot_id = v_lot.id
     AND branch_id IS NOT DISTINCT FROM v_order.branch_id AND canal_operacional = v_canal;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Saldo do lote produzido ausente ou ambíguo; conciliação obrigatória' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_balance FROM public.stock_balances
   WHERE company_id = v_company AND product_id = v_product.id AND lot_id = v_lot.id
     AND branch_id IS NOT DISTINCT FROM v_order.branch_id AND canal_operacional = v_canal FOR UPDATE;
  IF NOT FOUND OR v_balance.stock_status <> 'available'
     OR v_balance.reserved_qty < 0 OR v_balance.quantity::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_balance.reserved_qty::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_balance.quantity - v_balance.reserved_qty < v_req.quantity THEN
    RAISE EXCEPTION 'Saldo livre insuficiente no lote produzido; outros lotes não serão usados' USING ERRCODE = '23514';
  END IF;

  SELECT regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g') INTO v_destination_cnpj
    FROM public.companies WHERE id = v_req.requesting_company_id;
  SELECT regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g') INTO v_source_cnpj
    FROM public.companies WHERE id = v_company;
  IF length(v_destination_cnpj) <> 14 OR length(v_source_cnpj) <> 14 OR v_destination_cnpj = v_source_cnpj THEN
    RAISE EXCEPTION 'CNPJs distintos e cadastrados são necessários; validação legal/fiscal permanece pendente' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_count FROM public.clients
   WHERE company_id = v_company AND regexp_replace(document, '[^0-9]', '', 'g') = v_destination_cnpj AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cadastre/concilie um cliente ativo da indústria para o CNPJ da loja; nenhum cadastro fictício será criado' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_client FROM public.clients
   WHERE company_id = v_company AND regexp_replace(document, '[^0-9]', '', 'g') = v_destination_cnpj AND status = 'active' FOR SHARE;

  v_number := 'IC-PROD-' || v_req.id::text;
  INSERT INTO public.orders (
    company_id, branch_id, canal_operacional, number, client_id, client_name,
    subtotal, discount, shipping, total, payment_method, payment_condition, status, priority, internal_notes
  ) VALUES (
    v_company, v_order.branch_id, v_canal, v_number, v_client.id, v_client.name,
    v_req.quantity * v_product.sale_price, 0, 0, v_req.quantity * v_product.sale_price,
    'a_definir', COALESCE(NULLIF(btrim(v_client.default_payment_condition), ''), 'A definir'), 'pending', 'high',
    'LOJ-05A: demanda intercompany e reserva do lote produzido; fiscal, separação, expedição e cancelamento bloqueados. request_id=' || v_req.id::text
  ) RETURNING id INTO v_sales_order_id;
  INSERT INTO public.order_items (
    company_id, order_id, product_id, product_code, product_name, quantity, unit_price, discount, total
  ) VALUES (
    v_company, v_sales_order_id, v_product.id, v_product.code, v_product.name,
    v_req.quantity, v_product.sale_price, 0, v_req.quantity * v_product.sale_price
  ) RETURNING id INTO v_order_item_id;

  -- Hold lógico permitido pelo guard atual; quantity/remaining_qty e ledger
  -- NÃO mudam. Não chamar a reserva FIFO genérica: preserva o lote da OP.
  UPDATE public.stock_balances SET reserved_qty = reserved_qty + v_req.quantity, updated_at = now()
   WHERE id = v_balance.id;
  INSERT INTO public.stock_reservations (
    company_id, order_id, order_item_id, product_id, product_code, product_name,
    requested_qty, reserved_qty, picked_qty, location, status, reserved_by, reserved_at, lot_id
  ) VALUES (
    v_company, v_sales_order_id, v_order_item_id, v_product.id, v_product.code, v_product.name,
    v_req.quantity, v_req.quantity, 0, v_balance.location_code, 'reserved', v_user::text, now(), v_lot.id
  ) RETURNING id INTO v_reservation_id;

  INSERT INTO public.intercompany_production_releases (
    request_id, company_id, branch_id, requesting_company_id, requesting_branch_id,
    production_order_id, completion_id, output_lot_id, stock_balance_id,
    sales_order_id, order_item_id, reservation_id, quantity, unit, released_by
  ) VALUES (
    v_req.id, v_company, v_order.branch_id, v_req.requesting_company_id, v_req.requesting_branch_id,
    v_order.id, v_completion.id, v_lot.id, v_balance.id,
    v_sales_order_id, v_order_item_id, v_reservation_id, v_req.quantity, v_product.unit, v_user
  ) RETURNING * INTO v_release;
  UPDATE public.intercompany_replenishment_requests
     SET source_company_id = v_company, sales_order_id = v_sales_order_id, updated_at = now()
   WHERE id = v_req.id;
  -- O status permanece producao_solicitada; disponibilização logística é
  -- registrada acima, sem chamar isso de aprovação fiscal/recebimento.
  RETURN jsonb_build_object(
    'id', v_req.id, 'status', v_req.status, 'release_id', v_release.id,
    'release_status', v_release.release_status, 'production_order_id', v_order.id,
    'completion_id', v_completion.id, 'output_lot_id', v_lot.id,
    'sales_order_id', v_sales_order_id, 'reservation_id', v_reservation_id,
    'quantity', v_req.quantity, 'unit', v_product.unit,
    'dispatch_enabled', false, 'idempotent_replay', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_intercompany_production(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_intercompany_production(uuid) TO authenticated, service_role;

-- Bloqueio explícito sem override: também contém pedidos comerciais legados
-- vinculados à solicitação. Não altera pedidos/transferências de mesmo CNPJ.
CREATE OR REPLACE FUNCTION public.intercompany_order_fiscal_blocked(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.intercompany_replenishment_requests WHERE sales_order_id = p_order_id)
      OR EXISTS (SELECT 1 FROM public.intercompany_production_releases WHERE sales_order_id = p_order_id)
$$;
REVOKE ALL ON FUNCTION public.intercompany_order_fiscal_blocked(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_intercompany_dispatch_ready(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.intercompany_order_fiscal_blocked(p_order_id) THEN
    RAISE EXCEPTION 'Intercompany bloqueado: contrato de expedição e homologação fiscal pendentes; nenhuma saída autorizada' USING ERRCODE = '55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_intercompany_dispatch_ready(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_intercompany_order_fiscal_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_order_id uuid;
  v_new_order_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP <> 'INSERT' THEN v_old_order_id := OLD.id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_order_id := NEW.id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old_order_id := OLD.order_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_order_id := NEW.order_id; END IF;
  END IF;
  -- Testar OLD e NEW: mover item/reserva para outro pedido não é escape.
  PERFORM public.assert_intercompany_dispatch_ready(v_old_order_id);
  PERFORM public.assert_intercompany_dispatch_ready(v_new_order_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_intercompany_order_fiscal_freeze() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_intercompany_orders_fiscal_freeze ON public.orders;
CREATE TRIGGER guard_intercompany_orders_fiscal_freeze BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_order_fiscal_freeze();
DROP TRIGGER IF EXISTS guard_intercompany_items_fiscal_freeze ON public.order_items;
CREATE TRIGGER guard_intercompany_items_fiscal_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_order_fiscal_freeze();
DROP TRIGGER IF EXISTS guard_intercompany_reservations_fiscal_freeze ON public.stock_reservations;
CREATE TRIGGER guard_intercompany_reservations_fiscal_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_order_fiscal_freeze();
DROP TRIGGER IF EXISTS guard_intercompany_unit_allocations_fiscal_freeze ON public.stock_lot_unit_allocations;
CREATE TRIGGER guard_intercompany_unit_allocations_fiscal_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.stock_lot_unit_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_order_fiscal_freeze();

-- O hold também precisa sobreviver a caminhos genéricos que não recebem
-- request_id: outro pedido não pode consumir/liberar a reserva intercompany.
-- Sem mudar o ledger nem a semântica de WMS, impomos um piso somente nas
-- linhas/lotes efetivamente comprometidos. Estoque livre adicional continua
-- utilizável pelos fluxos normais; nenhuma GUC ignora este piso.
CREATE OR REPLACE FUNCTION public.guard_intercompany_production_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_held numeric;
BEGIN
  IF TG_TABLE_NAME = 'stock_balances' THEN
    SELECT COALESCE(sum(quantity), 0) INTO v_held
      FROM public.intercompany_production_releases WHERE stock_balance_id = OLD.id;
    IF v_held <= 0 THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Saldo comprometido com intercompany bloqueado; conciliação/cancelamento transacional pendentes' USING ERRCODE = '55000';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.lot_id IS DISTINCT FROM OLD.lot_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.canal_operacional IS DISTINCT FROM OLD.canal_operacional
       OR NEW.quantity IS NULL OR NEW.quantity < v_held OR NEW.reserved_qty IS NULL OR NEW.reserved_qty < v_held
       OR NEW.quantity::text IN ('NaN', 'Infinity', '-Infinity') OR NEW.reserved_qty::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Saldo comprometido com intercompany bloqueado; conciliação/cancelamento transacional pendentes' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT COALESCE(sum(quantity), 0) INTO v_held
      FROM public.intercompany_production_releases WHERE output_lot_id = OLD.id;
    IF v_held <= 0 THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Lote comprometido com intercompany bloqueado; conciliação/cancelamento transacional pendentes' USING ERRCODE = '55000';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.product_code IS DISTINCT FROM OLD.product_code
       OR NEW.remaining_qty IS NULL OR NEW.remaining_qty < v_held
       OR NEW.quantity IS NULL OR NEW.quantity < v_held
       OR NEW.remaining_qty::text IN ('NaN', 'Infinity', '-Infinity') OR NEW.quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Lote comprometido com intercompany bloqueado; conciliação/cancelamento transacional pendentes' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_intercompany_production_hold() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_intercompany_balance_hold ON public.stock_balances;
CREATE TRIGGER guard_intercompany_balance_hold BEFORE UPDATE OR DELETE ON public.stock_balances
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_production_hold();
DROP TRIGGER IF EXISTS guard_intercompany_lot_hold ON public.stock_lots;
CREATE TRIGGER guard_intercompany_lot_hold BEFORE UPDATE OR DELETE ON public.stock_lots
  FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_production_hold();

-- Compatibilidade da assinatura, NÃO compatibilidade com o bypass antigo.
-- Até existir entrega identificada/idempotente e lastro fiscal não há entrada.
CREATE OR REPLACE FUNCTION public.receive_intercompany_delivery(p_request_id uuid, p_quantity numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e empresa são obrigatórios' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.intercompany_replenishment_requests
   WHERE id = p_request_id AND requesting_company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não pertence à loja solicitante' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Recebimento intercompany bloqueado: entrega/expedição identificada ainda não implementada; legado exige conciliação individual, sem entrada automática'
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.receive_intercompany_delivery(uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_intercompany_delivery(uuid, numeric) TO authenticated, service_role;

-- As versões WMS abaixo preservam os corpos vigentes de
-- 20261028140000_stock_lot_unit_expedition, com uma única guarda por pedido
-- (após autorização tenant) e search_path explícito. Não há segunda baixa.

CREATE OR REPLACE FUNCTION public.wms_pick_order_stock(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order_company uuid; v_order_number text;
  r RECORD; v_take numeric; v_remaining numeric; v_lot_number text; v_lot_remaining numeric;
  v_total_picked numeric := 0; v_lines_picked int := 0; v_lines_short int := 0;
BEGIN
  PERFORM set_config('app.stock_ledger_bypass','on', true);

  IF v_company IS NULL THEN RAISE EXCEPTION 'forbidden: user has no company'; END IF;
  SELECT company_id, number INTO v_order_company, v_order_number FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order_company <> v_company THEN RAISE EXCEPTION 'forbidden: cross-tenant order'; END IF;
  PERFORM public.assert_intercompany_dispatch_ready(p_order_id);

  FOR r IN
    SELECT id, product_id, product_code, product_name, reserved_qty, picked_qty, lot_id
    FROM public.stock_reservations
    WHERE order_id = p_order_id AND company_id = v_company AND status = 'reserved'
    FOR UPDATE
  LOOP
    v_remaining := r.reserved_qty - COALESCE(r.picked_qty, 0);
    IF v_remaining <= 0 THEN CONTINUE; END IF;

    FOR v_take IN
      SELECT LEAST(sb.reserved_qty, v_remaining)
      FROM public.stock_balances sb
      WHERE sb.company_id = v_company AND sb.product_id = r.product_id AND sb.reserved_qty > 0
        AND (r.lot_id IS NULL OR sb.lot_id = r.lot_id)
      ORDER BY sb.created_at FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      UPDATE public.stock_balances sb
         SET reserved_qty = reserved_qty - v_take,
             quantity     = GREATEST(quantity - v_take, 0),
             last_movement_at = now(), updated_at = now()
       WHERE sb.company_id = v_company AND sb.product_id = r.product_id AND sb.reserved_qty >= v_take
         AND (r.lot_id IS NULL OR sb.lot_id = r.lot_id)
         AND ctid = (SELECT ctid FROM public.stock_balances
                     WHERE company_id = v_company AND product_id = r.product_id AND reserved_qty > 0
                       AND (r.lot_id IS NULL OR lot_id = r.lot_id)
                     ORDER BY created_at LIMIT 1);
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining = 0 THEN
      UPDATE public.stock_reservations SET status = 'picked', picked_qty = reserved_qty, updated_at = now() WHERE id = r.id;
      v_lines_picked := v_lines_picked + 1;
      v_total_picked := v_total_picked + r.reserved_qty;

      -- Rolos/peças vinculados a esta reserva são considerados separados.
      UPDATE public.stock_lot_unit_allocations
         SET status = 'picked', picked_at = COALESCE(picked_at, now()), updated_at = now()
       WHERE company_id = v_company AND order_id = p_order_id
         AND reservation_id = r.id AND status = 'allocated';

      v_lot_number := NULL;
      IF r.lot_id IS NOT NULL THEN
        UPDATE public.stock_lots
           SET remaining_qty = GREATEST(remaining_qty - r.reserved_qty, 0),
               status = CASE WHEN remaining_qty - r.reserved_qty <= 0 THEN 'consumed' ELSE status END,
               updated_at = now()
         WHERE id = r.lot_id AND company_id = v_company
         RETURNING lot_number INTO v_lot_number;
      END IF;
      INSERT INTO public.stock_movements
        (product_id, product_code, product_name, type, direction, quantity,
         reference, notes, operator, source, company_id, lot_id, batch)
      VALUES
        (r.product_id, r.product_code, r.product_name, 'outbound', 'transfer', r.reserved_qty,
         COALESCE(v_order_number, p_order_id::text),
         'Separação de pedido', COALESCE(auth.uid()::text,'system'), 'wms_pick', v_company,
         r.lot_id, v_lot_number);
    ELSE
      UPDATE public.stock_reservations SET picked_qty = reserved_qty - v_remaining, updated_at = now() WHERE id = r.id;
      v_lines_short := v_lines_short + 1;
      v_total_picked := v_total_picked + (r.reserved_qty - v_remaining);
    END IF;
  END LOOP;

  PERFORM set_config('app.stock_ledger_bypass','off', true);
  RETURN jsonb_build_object('order_id', p_order_id, 'lines_picked', v_lines_picked,
    'lines_short', v_lines_short, 'total_picked', v_total_picked);
END;
$function$;

REVOKE ALL ON FUNCTION public.wms_pick_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_pick_order_stock(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wms_ship_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order_company uuid;
  v_count int;
  v_units int := 0;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'forbidden: user has no company';
  END IF;

  SELECT company_id INTO v_order_company FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order_company <> v_company THEN RAISE EXCEPTION 'forbidden: cross-tenant order'; END IF;
  PERFORM public.assert_intercompany_dispatch_ready(p_order_id);

  UPDATE public.stock_reservations
     SET status = 'shipped',
         updated_at = now()
   WHERE order_id = p_order_id
     AND company_id = v_company
     AND status = 'picked';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  WITH shipped_allocations AS (
    UPDATE public.stock_lot_unit_allocations
       SET status = 'shipped', shipped_at = now(), updated_at = now()
     WHERE company_id = v_company AND order_id = p_order_id
       AND status IN ('allocated', 'picked')
     RETURNING unit_id
  )
  UPDATE public.stock_lot_units u
     SET status = 'shipped', shipped_at = now(), updated_at = now()
    FROM shipped_allocations sa
   WHERE u.id = sa.unit_id AND u.company_id = v_company;
  GET DIAGNOSTICS v_units = ROW_COUNT;

  RETURN jsonb_build_object('order_id', p_order_id, 'lines_shipped', v_count, 'units_shipped', v_units);
END;
$$;

REVOKE ALL ON FUNCTION public.wms_ship_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_ship_order(uuid) TO authenticated, service_role;
