-- Gate industrial: conclusão transacional de ordem de produção.
--
-- Objetivo: permitir a conclusão de uma OP somente por uma RPC que, em uma
-- única transação, valida empresa/filial/permissão, operações obrigatórias,
-- inspeção de qualidade, ficha de materiais, lotes liberados e saldo
-- disponível; consome lotes específicos; cria o lote de saída; registra
-- genealogia persistida; lança os movimentos no ledger existente
-- (stock_movements) e marca a OP como concluída.
--
-- Esta migration NÃO libera a conclusão direta pela interface/tabela. O
-- trigger de bloqueio continua ativo e só aceita a transição quando existe
-- uma solicitação de conclusão criada por esta RPC na mesma transação.
--
-- Rollback manual (preservar evidências antes; executar apenas em janela
-- aprovada): remover a RPC e as tabelas/colunas adicionadas abaixo e restaurar
-- as versões anteriores de block_unverified_production_completion() e
-- apply_lot_movement(). Não apague movimentos de estoque já lançados; eles são
-- o ledger auditável.

CREATE TABLE IF NOT EXISTS public.production_completion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id),
  idempotency_key text NOT NULL,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  produced_quantity numeric NOT NULL,
  rejected_quantity numeric NOT NULL DEFAULT 0,
  output_lot_id uuid REFERENCES public.stock_lots(id),
  output_unit_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_completion_requests_status_check
    CHECK (status IN ('completed')),
  CONSTRAINT production_completion_requests_quantities_check
    CHECK (
      produced_quantity > 0
      AND produced_quantity <> 'NaN'::numeric
      AND rejected_quantity >= 0
      AND rejected_quantity <> 'NaN'::numeric
      AND output_unit_cost >= 0
      AND output_unit_cost <> 'NaN'::numeric
    ),
  CONSTRAINT production_completion_requests_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS production_completion_requests_company_key_uidx
  ON public.production_completion_requests (company_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS production_completion_requests_order_uidx
  ON public.production_completion_requests (production_order_id);
CREATE INDEX IF NOT EXISTS production_completion_requests_company_order_idx
  ON public.production_completion_requests (company_id, production_order_id, created_at DESC);

ALTER TABLE public.production_completion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_completion_requests_select ON public.production_completion_requests;
CREATE POLICY production_completion_requests_select
  ON public.production_completion_requests
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

REVOKE ALL ON public.production_completion_requests FROM PUBLIC, anon;
GRANT SELECT ON public.production_completion_requests TO authenticated;
GRANT ALL ON public.production_completion_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.production_lot_genealogy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id),
  completion_id uuid NOT NULL REFERENCES public.production_completion_requests(id),
  input_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  output_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  input_quantity numeric NOT NULL,
  -- Quantidade total do lote de saída gerado pela conclusão. Em uma conclusão
  -- com vários insumos, esta coluna se repete nas arestas e NÃO deve ser
  -- somada por aresta; some input_quantity para consumo e use o lote de saída
  -- para a quantidade produzida.
  output_quantity numeric NOT NULL,
  input_unit text NOT NULL,
  output_unit text NOT NULL,
  conversion_reference text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_lot_genealogy_quantities_check
    CHECK (
      input_quantity > 0 AND input_quantity <> 'NaN'::numeric
      AND output_quantity > 0 AND output_quantity <> 'NaN'::numeric
    ),
  CONSTRAINT production_lot_genealogy_distinct_lots_check
    CHECK (input_lot_id <> output_lot_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS production_lot_genealogy_edge_uidx
  ON public.production_lot_genealogy (company_id, production_order_id, input_lot_id, output_lot_id);
CREATE INDEX IF NOT EXISTS production_lot_genealogy_output_idx
  ON public.production_lot_genealogy (company_id, output_lot_id, created_at);
CREATE INDEX IF NOT EXISTS production_lot_genealogy_input_idx
  ON public.production_lot_genealogy (company_id, input_lot_id, created_at);
CREATE INDEX IF NOT EXISTS production_lot_genealogy_order_idx
  ON public.production_lot_genealogy (company_id, production_order_id, created_at);

ALTER TABLE public.production_lot_genealogy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_lot_genealogy_select ON public.production_lot_genealogy;
CREATE POLICY production_lot_genealogy_select
  ON public.production_lot_genealogy
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

REVOKE ALL ON public.production_lot_genealogy FROM PUBLIC, anon;
GRANT SELECT ON public.production_lot_genealogy TO authenticated;
GRANT ALL ON public.production_lot_genealogy TO service_role;

-- Liga o consumo já existente ao lote, à conclusão e ao movimento do ledger.
-- Não cria um segundo ledger: stock_movements continua sendo o livro-razão.
ALTER TABLE public.material_consumptions
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.stock_lots(id),
  ADD COLUMN IF NOT EXISTS completion_id uuid REFERENCES public.production_completion_requests(id),
  ADD COLUMN IF NOT EXISTS stock_movement_id uuid REFERENCES public.stock_movements(id);

CREATE INDEX IF NOT EXISTS material_consumptions_lot_idx
  ON public.material_consumptions (company_id, lot_id, consumed_at DESC);
CREATE INDEX IF NOT EXISTS material_consumptions_completion_idx
  ON public.material_consumptions (company_id, completion_id);

-- A RPC atualiza remaining_qty/consumed_qty do lote de entrada de forma
-- explícita. Sem este desvio, o trigger legado poderia debitar o lote uma
-- segunda vez quando a flag global 'usar_lote' estivesse habilitada.
CREATE OR REPLACE FUNCTION public.apply_lot_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_remaining numeric;
BEGIN
  IF NEW.source = 'production_completion' THEN
    RETURN NEW;
  END IF;

  SELECT enabled INTO v_enabled FROM public.feature_flags WHERE flag_key = 'usar_lote';
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;
  IF NEW.lot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.direction = 'out' THEN
    SELECT remaining_qty INTO v_remaining
      FROM public.stock_lots
     WHERE id = NEW.lot_id
     FOR UPDATE;
    IF v_remaining IS NULL THEN
      RAISE EXCEPTION 'Lote % não encontrado', NEW.lot_id;
    END IF;
    IF v_remaining < NEW.quantity THEN
      INSERT INTO public.lot_migration_audit (event_type, lot_id, details)
      VALUES ('inconsistency', NEW.lot_id,
              jsonb_build_object('reason', 'insufficient_lot_qty', 'requested', NEW.quantity, 'available', v_remaining));
      RAISE EXCEPTION 'Quantidade insuficiente no lote (disp: %, req: %)', v_remaining, NEW.quantity;
    END IF;
    UPDATE public.stock_lots
       SET remaining_qty = remaining_qty - NEW.quantity,
           updated_at = now()
     WHERE id = NEW.lot_id;
  ELSIF NEW.direction = 'in' THEN
    UPDATE public.stock_lots
       SET remaining_qty = remaining_qty + NEW.quantity,
           updated_at = now()
     WHERE id = NEW.lot_id;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_lot_movement() FROM PUBLIC, anon, authenticated;

-- Mantém o fail-closed para qualquer escrita direta. A única exceção é a
-- transição feita depois que a RPC gravou a solicitação de conclusão para a
-- mesma OP/empresa na transação corrente.
CREATE OR REPLACE FUNCTION public.block_unverified_production_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.production_completion_requests r
       WHERE r.production_order_id = NEW.id
         AND r.company_id = NEW.company_id
         AND r.status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Conclusão de OP exige a transação complete_production_order com consumo por lote, operações, qualidade e genealogia validados'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_unverified_production_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_unverified_production_completion ON public.production_orders;
CREATE TRIGGER tr_block_unverified_production_completion
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.block_unverified_production_completion();

CREATE OR REPLACE FUNCTION public.complete_production_order(
  p_production_order_id uuid,
  p_idempotency_key text,
  p_produced_quantity numeric,
  p_rejected_quantity numeric DEFAULT 0,
  p_input_allocations jsonb DEFAULT '[]'::jsonb,
  p_output_lot_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_user_branch_id uuid;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_order public.production_orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_canal public.canal_operacional := 'ATACADO_INDUSTRIA'::public.canal_operacional;
  v_existing public.production_completion_requests%ROWTYPE;
  v_existing_key public.production_completion_requests%ROWTYPE;
  v_output_lot public.stock_lots%ROWTYPE;
  v_total_processed numeric;
  v_step_count integer := 0;
  v_step_completed integer := 0;
  v_quality_count integer := 0;
  v_quality_approved numeric := 0;
  v_quality_rejected numeric := 0;
  v_quality_blocked boolean := false;
  v_bom_count integer := 0;
  v_bom record;
  v_alloc record;
  v_elem record;
  v_allocated numeric;
  v_lot public.stock_lots%ROWTYPE;
  v_component public.products%ROWTYPE;
  v_available numeric;
  v_balance_id uuid;
  v_completion_id uuid;
  v_output_lot_id uuid;
  v_output_lot_number text;
  v_total_input_cost numeric := 0;
  v_output_unit_cost numeric := 0;
  v_movement_id uuid;
  v_expected_total numeric;
  v_expected_share numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório para concluir uma OP'
      USING ERRCODE = '42501';
  END IF;
  IF p_production_order_id IS NULL THEN
    RAISE EXCEPTION 'production_order_id é obrigatório' USING ERRCODE = '22004';
  END IF;
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0
     OR p_produced_quantity = 'NaN'::numeric
     OR p_produced_quantity = 'Infinity'::numeric
     OR p_produced_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'produced_quantity deve ser positiva e finita'
      USING ERRCODE = '22023';
  END IF;
  IF p_rejected_quantity IS NULL OR p_rejected_quantity < 0
     OR p_rejected_quantity = 'NaN'::numeric
     OR p_rejected_quantity = 'Infinity'::numeric
     OR p_rejected_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'rejected_quantity deve ser não negativa e finita'
      USING ERRCODE = '22023';
  END IF;
  IF p_input_allocations IS NULL OR jsonb_typeof(p_input_allocations) <> 'array'
     OR jsonb_array_length(p_input_allocations) = 0 THEN
    RAISE EXCEPTION 'input_allocations deve informar ao menos um lote de entrada'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN
    SELECT elem
      FROM jsonb_array_elements(p_input_allocations) AS elem
  LOOP
    IF jsonb_typeof(v_elem.elem) <> 'object'
       OR NULLIF(btrim(v_elem.elem ->> 'component_id'), '') IS NULL
       OR NULLIF(btrim(v_elem.elem ->> 'lot_id'), '') IS NULL
       OR NULLIF(btrim(v_elem.elem ->> 'quantity'), '') IS NULL THEN
      RAISE EXCEPTION 'Cada alocação exige component_id, lot_id e quantity'
        USING ERRCODE = '22023';
    END IF;
    IF (v_elem.elem ->> 'quantity')::numeric <= 0
       OR (v_elem.elem ->> 'quantity')::numeric = 'NaN'::numeric
       OR (v_elem.elem ->> 'quantity')::numeric = 'Infinity'::numeric THEN
      RAISE EXCEPTION 'quantity de cada alocação deve ser positiva e finita'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_order
    FROM public.production_orders
   WHERE id = p_production_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de produção não encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL OR v_order.company_id <> v_company_id THEN
    RAISE EXCEPTION 'OP não pertence à empresa do usuário autenticado'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission(v_user_id, v_order.company_id, 'production.orders', 'write')
    OR public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão production.orders/write para concluir a OP'
      USING ERRCODE = '42501';
  END IF;

  IF v_order.branch_id IS NOT NULL THEN
    SELECT * INTO v_branch
      FROM public.branches
     WHERE id = v_order.branch_id AND company_id = v_order.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Filial da OP não pertence à empresa da ordem'
        USING ERRCODE = '42501';
    END IF;
    v_canal := COALESCE(v_branch.canal_padrao, v_canal);
    v_user_branch_id := public.get_user_branch_id(v_user_id);
    IF v_user_branch_id IS NOT NULL
       AND v_user_branch_id <> v_order.branch_id
       AND NOT public.is_matriz_viewer(v_user_id) THEN
      RAISE EXCEPTION 'OP pertence a outra filial e o usuário não possui visão de matriz'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_existing
    FROM public.production_completion_requests
   WHERE production_order_id = v_order.id
     AND company_id = v_order.company_id;
  IF FOUND THEN
    IF v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'Solicitação de conclusão existe, mas a OP não está concluída; intervenção auditada é necessária'
        USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_output_lot FROM public.stock_lots WHERE id = v_existing.output_lot_id;
    RETURN jsonb_build_object(
      'completion_id', v_existing.id,
      'production_order_id', v_existing.production_order_id,
      'output_lot_id', v_existing.output_lot_id,
      'output_lot_number', v_output_lot.lot_number,
      'produced_quantity', v_existing.produced_quantity,
      'rejected_quantity', v_existing.rejected_quantity,
      'status', v_order.status,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_existing_key
    FROM public.production_completion_requests
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF FOUND AND v_existing_key.production_order_id <> v_order.id THEN
    RAISE EXCEPTION 'idempotency_key já foi utilizada para outra OP'
      USING ERRCODE = '23505';
  END IF;

  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'OP já consta concluída sem solicitação transacional; reabertura/conclusão exige intervenção auditada'
      USING ERRCODE = '55000';
  END IF;
  IF v_order.status NOT IN ('in_progress', 'finishing', 'quality_check') THEN
    RAISE EXCEPTION 'OP precisa estar em produção, acabamento ou controle de qualidade para conclusão; status atual: %', v_order.status
      USING ERRCODE = '55000';
  END IF;
  IF v_order.product_id IS NULL THEN
    RAISE EXCEPTION 'OP sem produto vinculado não pode gerar lote de saída'
      USING ERRCODE = '23514';
  END IF;
  IF v_order.quantity IS NULL OR v_order.quantity <= 0 OR v_order.quantity = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Quantidade planejada da OP é inválida' USING ERRCODE = '23514';
  END IF;

  v_total_processed := p_produced_quantity + p_rejected_quantity;
  IF v_total_processed < v_order.quantity THEN
    RAISE EXCEPTION 'Quantidade processada (%) é parcial frente ao planejado (%); conclusão final não permitida', v_total_processed, v_order.quantity
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = v_order.product_id AND company_id = v_order.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(v_product.unit, '')), '') IS NOT NULL
     AND NULLIF(btrim(COALESCE(v_order.unit, '')), '') IS NOT NULL
     AND lower(btrim(v_product.unit)) <> lower(btrim(v_order.unit)) THEN
    RAISE EXCEPTION 'Unidade da OP (%) difere da unidade do produto (%); conversão configurada é obrigatória', v_order.unit, v_product.unit
      USING ERRCODE = '23514';
  END IF;

  IF v_order.route_id IS NULL THEN
    RAISE EXCEPTION 'OP sem roteiro congelado/vinculado não pode ser concluída por esta transação'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id
   FOR UPDATE;
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE status = 'completed'
             AND quantity_pending <= 0
             AND quantity_produced >= v_total_processed
         )::integer
    INTO v_step_count, v_step_completed
    FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_step_count = 0 OR v_step_completed <> v_step_count THEN
    RAISE EXCEPTION 'OP possui operação obrigatória pendente ou quantidade de operação insuficiente (% de % concluídas)', v_step_completed, v_step_count
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id
   FOR UPDATE;
  SELECT count(*)::integer,
         COALESCE(sum(approved_quantity), 0),
         COALESCE(sum(rejected_quantity), 0),
         COALESCE(bool_or(lower(status) IN (
           'blocked', 'rejected', 'quarantine', 'bloqueada', 'bloqueado',
           'rejeitada', 'rejeitado', 'quarentena'
         )), false)
    INTO v_quality_count, v_quality_approved, v_quality_rejected, v_quality_blocked
    FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_quality_count = 0 THEN
    RAISE EXCEPTION 'OP sem inspeção de qualidade registrada não pode ser concluída'
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_blocked THEN
    RAISE EXCEPTION 'OP possui inspeção de qualidade bloqueada/rejeitada/em quarentena'
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_approved < p_produced_quantity THEN
    RAISE EXCEPTION 'Quantidade aprovada na qualidade (%) é menor que a quantidade produzida (%)', v_quality_approved, p_produced_quantity
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_rejected > p_rejected_quantity THEN
    RAISE EXCEPTION 'Quantidade rejeitada na qualidade (%) excede a rejeição declarada na conclusão (%)', v_quality_rejected, p_rejected_quantity
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_bom_count
    FROM public.production_bom
   WHERE company_id = v_order.company_id AND product_id = v_order.product_id;
  IF v_bom_count = 0 THEN
    RAISE EXCEPTION 'Produto da OP não possui ficha de materiais (BOM) para comprovar consumo'
      USING ERRCODE = '23514';
  END IF;

  FOR v_bom IN
    SELECT bom.*, component.code AS component_code,
           component.name AS component_name, component.unit AS component_unit
      FROM public.production_bom bom
      JOIN public.products component
        ON component.id = bom.component_id AND component.company_id = bom.company_id
     WHERE bom.company_id = v_order.company_id AND bom.product_id = v_order.product_id
     ORDER BY component.code, bom.id
  LOOP
    SELECT COALESCE(sum((elem ->> 'quantity')::numeric), 0) INTO v_allocated
      FROM jsonb_array_elements(p_input_allocations) elem
     WHERE (elem ->> 'component_id')::uuid = v_bom.component_id;
    IF v_allocated <= 0 THEN
      RAISE EXCEPTION 'Componente da ficha sem lote alocado: % (%)', v_bom.component_name, v_bom.component_code
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Trava e valida todos os lotes antes de qualquer escrita. A ordem por lote
  -- reduz deadlock entre OPs diferentes que disputam o mesmo insumo.
  FOR v_alloc IN
    SELECT (elem ->> 'component_id')::uuid AS component_id,
           (elem ->> 'lot_id')::uuid AS lot_id,
           sum((elem ->> 'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_input_allocations) elem
     GROUP BY 1, 2
     ORDER BY 2
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.production_bom
       WHERE company_id = v_order.company_id
         AND product_id = v_order.product_id
         AND component_id = v_alloc.component_id
    ) THEN
      RAISE EXCEPTION 'Lote alocado para componente fora da ficha da OP: %', v_alloc.component_id
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_component
      FROM public.products
     WHERE id = v_alloc.component_id AND company_id = v_order.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Componente alocado não pertence à empresa da OP'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_lot
      FROM public.stock_lots
     WHERE id = v_alloc.lot_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote de entrada não encontrado: %', v_alloc.lot_id
        USING ERRCODE = 'P0002';
    END IF;
    IF v_lot.company_id <> v_order.company_id OR v_lot.product_id <> v_alloc.component_id THEN
      RAISE EXCEPTION 'Lote % não pertence ao componente/empresa da alocação', v_lot.lot_number
        USING ERRCODE = '42501';
    END IF;
    IF lower(COALESCE(v_lot.status, '')) <> 'available' THEN
      RAISE EXCEPTION 'Lote % não está disponível (status: %)', v_lot.lot_number, v_lot.status
        USING ERRCODE = '23514';
    END IF;
    IF lower(COALESCE(v_lot.quality_status, '')) NOT IN (
      'approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada'
    ) THEN
      RAISE EXCEPTION 'Lote % não está liberado pela qualidade (quality_status: %)', v_lot.lot_number, v_lot.quality_status
        USING ERRCODE = '23514';
    END IF;
    IF v_lot.remaining_qty < v_alloc.quantity THEN
      RAISE EXCEPTION 'Lote % possui saldo restante insuficiente (%, requerido %)', v_lot.lot_number, v_lot.remaining_qty, v_alloc.quantity
        USING ERRCODE = '23514';
    END IF;

    FOR v_balance_id IN
      SELECT id
        FROM public.stock_balances
       WHERE company_id = v_order.company_id
         AND product_id = v_alloc.component_id
         AND lot_id = v_alloc.lot_id
         AND branch_id IS NOT DISTINCT FROM v_order.branch_id
         AND canal_operacional = v_canal
       ORDER BY id
       FOR UPDATE
    LOOP
      NULL;
    END LOOP;

    SELECT COALESCE(sum(quantity - reserved_qty), 0) INTO v_available
      FROM public.stock_balances
     WHERE company_id = v_order.company_id
       AND product_id = v_alloc.component_id
       AND lot_id = v_alloc.lot_id
       AND branch_id IS NOT DISTINCT FROM v_order.branch_id
       AND canal_operacional = v_canal;
    IF v_available < v_alloc.quantity THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente para o lote % (%, requerido %; reservado/bloqueado não pode ser consumido)', v_lot.lot_number, v_available, v_alloc.quantity
        USING ERRCODE = '23514';
    END IF;

    v_total_input_cost := v_total_input_cost + (v_alloc.quantity * COALESCE(v_lot.unit_cost, 0));
  END LOOP;

  v_output_unit_cost := CASE WHEN p_produced_quantity > 0
                             THEN v_total_input_cost / p_produced_quantity
                             ELSE 0 END;
  v_output_lot_number := COALESCE(
    NULLIF(btrim(p_output_lot_number), ''),
    'PROD-' || v_order.order_number || '-' || upper(substr(md5(v_key), 1, 8))
  );
  IF EXISTS (
    SELECT 1 FROM public.stock_lots
     WHERE company_id = v_order.company_id AND lot_number = v_output_lot_number
  ) THEN
    RAISE EXCEPTION 'Já existe lote com o número % nesta empresa', v_output_lot_number
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.stock_lots (
    company_id, product_id, product_code, product_name, lot_number,
    quantity, remaining_qty, initial_quantity, consumed_qty, received_qty,
    unit_cost, origin, origin_type, origin_reference, status, quality_status,
    notes
  ) VALUES (
    v_order.company_id, v_order.product_id, v_order.product_code, v_order.product_name,
    v_output_lot_number, p_produced_quantity, p_produced_quantity,
    p_produced_quantity, 0, p_produced_quantity, v_output_unit_cost,
    'Produção OP ' || v_order.order_number, 'PRODUCAO', v_order.order_number,
    'available', 'approved',
    'Lote gerado por complete_production_order; custo unitário considera somente materiais dos lotes consumidos.'
  ) RETURNING id INTO v_output_lot_id;

  INSERT INTO public.production_completion_requests (
    company_id, branch_id, production_order_id, idempotency_key, requested_by,
    produced_quantity, rejected_quantity, output_lot_id, output_unit_cost, status
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, v_key, v_user_id,
    p_produced_quantity, p_rejected_quantity, v_output_lot_id, v_output_unit_cost,
    'completed'
  ) RETURNING id INTO v_completion_id;

  FOR v_alloc IN
    SELECT (elem ->> 'component_id')::uuid AS component_id,
           (elem ->> 'lot_id')::uuid AS lot_id,
           sum((elem ->> 'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_input_allocations) elem
     GROUP BY 1, 2
     ORDER BY 2
  LOOP
    SELECT * INTO v_lot FROM public.stock_lots WHERE id = v_alloc.lot_id;
    SELECT * INTO v_component
      FROM public.products
     WHERE id = v_alloc.component_id AND company_id = v_order.company_id;
    SELECT bom.quantity, bom.waste_percentage
      INTO v_bom.quantity, v_bom.waste_percentage
      FROM public.production_bom bom
     WHERE bom.company_id = v_order.company_id
       AND bom.product_id = v_order.product_id
       AND bom.component_id = v_alloc.component_id
     ORDER BY bom.id
     LIMIT 1;

    SELECT COALESCE(sum((elem ->> 'quantity')::numeric), 0) INTO v_allocated
      FROM jsonb_array_elements(p_input_allocations) elem
     WHERE (elem ->> 'component_id')::uuid = v_alloc.component_id;
    v_expected_total := v_bom.quantity * v_total_processed
                        * (1 + COALESCE(v_bom.waste_percentage, 0) / 100);
    v_expected_share := CASE WHEN v_allocated > 0
                             THEN v_expected_total * v_alloc.quantity / v_allocated
                             ELSE v_expected_total END;

    UPDATE public.stock_lots
       SET remaining_qty = remaining_qty - v_alloc.quantity,
           consumed_qty = COALESCE(consumed_qty, 0) + v_alloc.quantity,
           status = CASE WHEN remaining_qty - v_alloc.quantity <= 0 THEN 'consumed' ELSE status END,
           updated_at = now()
     WHERE id = v_alloc.lot_id AND company_id = v_order.company_id;

    INSERT INTO public.stock_movements (
      company_id, branch_id, canal_operacional, product_id, product_code,
      product_name, type, direction, quantity, unit_cost, total_cost,
      document_number, operator, source, origin, destination, reference,
      notes, lot_id, batch
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_canal, v_component.id,
      v_component.code, v_component.name, 'production_consumption', 'out',
      v_alloc.quantity, COALESCE(v_lot.unit_cost, 0),
      v_alloc.quantity * COALESCE(v_lot.unit_cost, 0),
      'PROD-' || v_order.order_number, v_user_id::text, 'production_completion',
      'production_completion', 'OP ' || v_order.order_number,
      'production_order_id=' || v_order.id::text,
      'Consumo por lote na conclusão transacional; completion_id=' || v_completion_id::text,
      v_alloc.lot_id, v_lot.lot_number
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.material_consumptions (
      company_id, production_order_id, order_number, component_code,
      component_name, expected_quantity, consumed_quantity, unit, batch,
      location, consumed_by, lot_id, completion_id, stock_movement_id
    ) VALUES (
      v_order.company_id, v_order.id, v_order.order_number, v_component.code,
      v_component.name, v_expected_share, v_alloc.quantity, v_component.unit,
      v_lot.lot_number, v_lot.location, v_user_id::text, v_alloc.lot_id,
      v_completion_id, v_movement_id
    );

    INSERT INTO public.production_lot_genealogy (
      company_id, branch_id, production_order_id, completion_id, input_lot_id,
      output_lot_id, input_quantity, output_quantity, input_unit, output_unit,
      conversion_reference, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_completion_id,
      v_alloc.lot_id, v_output_lot_id, v_alloc.quantity, p_produced_quantity,
      v_component.unit, COALESCE(NULLIF(v_order.unit, ''), v_product.unit),
      CASE
        WHEN lower(COALESCE(v_component.unit, '')) = lower(COALESCE(NULLIF(v_order.unit, ''), v_product.unit))
          THEN 'Mesma unidade do produto de saída; consumo registrado na unidade do componente.'
        ELSE 'Referência configurada na ficha: ' || v_bom.quantity::text || ' '
             || COALESCE(v_component.unit, 'sem unidade') || ' por unidade-base da ficha, perda planejada '
             || COALESCE(v_bom.waste_percentage, 0)::text || '%. Nenhuma conversão universal foi presumida.'
      END,
      v_user_id
    );
  END LOOP;

  INSERT INTO public.stock_movements (
    company_id, branch_id, canal_operacional, product_id, product_code,
    product_name, type, direction, quantity, unit_cost, total_cost,
    document_number, operator, source, origin, destination, reference,
    notes, lot_id, batch
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_canal, v_order.product_id,
    v_order.product_code, v_order.product_name, 'production', 'in',
    p_produced_quantity, v_output_unit_cost, v_total_input_cost,
    'PROD-' || v_order.order_number, v_user_id::text, 'production_completion',
    'OP ' || v_order.order_number, 'production_completion',
    'production_order_id=' || v_order.id::text,
    'Entrada do lote produzido na conclusão transacional; completion_id=' || v_completion_id::text,
    v_output_lot_id, v_output_lot_number
  );

  UPDATE public.production_orders
     SET status = 'completed',
         produced_quantity = p_produced_quantity,
         rejected_quantity = p_rejected_quantity,
         completed_date = now(),
         updated_at = now()
   WHERE id = v_order.id AND company_id = v_order.company_id;

  RETURN jsonb_build_object(
    'completion_id', v_completion_id,
    'production_order_id', v_order.id,
    'output_lot_id', v_output_lot_id,
    'output_lot_number', v_output_lot_number,
    'produced_quantity', p_produced_quantity,
    'rejected_quantity', p_rejected_quantity,
    'status', 'completed',
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_production_order(uuid, text, numeric, numeric, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_order(uuid, text, numeric, numeric, jsonb, text)
  TO authenticated, service_role;
