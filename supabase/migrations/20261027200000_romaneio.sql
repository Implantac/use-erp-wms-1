-- ============================================================================
-- Romaneio de expedição: o gestor executa a malha do grupo, não transferência
-- por transferência.
--
-- Dores atacadas (Central de Abastecimento):
--  1) Executar uma transferência exigia até 6 cliques em "Avançar"
--     (SUGERIDA->APROVADA->RESERVADA->SEPARAÇÃO->CONFERÊNCIA->EXPEDIDA->
--     EM TRÂNSITO), uma a uma, sem agrupar a carga nem gerar documento.
--  2) A máquina oficial (transition_stock_transfer) só aceitava operador da
--     MESMA empresa da ordem: o gestor do grupo, vendo a malha inteira,
--     não conseguia avançar a transferência de uma Loja sem trocar o
--     contexto de empresa (erro 42501 no meio da operação).
--
-- Correções (sem segundo ledger e sem máquina paralela):
--  a) transition_stock_transfer: CREATE OR REPLACE idêntico, exceto:
--       - gestor do grupo (is_group_manager) pode executar transferências
--         das empresas do seu grupo;
--       - a decisão APROVADA/REJEITADA também aceita o gestor do grupo;
--       - stock_movements passa a ser carimbado com a empresa DONA da
--         ordem (v_order.company_id), não com a empresa de contexto de
--         quem clicou. No caminho intra-empresa nada muda (são iguais).
--  b) Romaneio: documento que AGRUPA as transferências prontas de uma
--     mesma origem -> mesmo destino. Gerar o romaneio anda cada
--     transferência pela máquina oficial até EM TRÂNSITO (a EXPEDIDA baixa
--     o estoque da origem pelo ledger único) e o documento passa a ser a
--     referência da carga. A Loja recepciona O DOCUMENTO: um único
--     recebimento confere os itens de todas as transferências, alimenta o
--     estoque da Loja pelo mesmo ledger e marca o romaneio como RECEBIDO
--     (ou RECEBIDO COM DIVERGÊNCIA, quando falta item).
--
-- Rollback: DROP FUNCTION public.create_romaneio(uuid[]);
--           DROP FUNCTION public.receive_romaneio(uuid, jsonb);
--           DROP FUNCTION public.group_romaneios();
--           DROP FUNCTION public.group_romaneio_detail(uuid);
--           ALTER TABLE public.stock_transfer_orders DROP COLUMN romaneio_id;
--           DROP TABLE public.stock_transfer_romaneios;
--           (e recriar transition_stock_transfer/group_transfer_orders
--            a partir das migrations 20261019230000/20261027170000)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- a) Máquina oficial autorizada para o gestor do grupo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_stock_transfer(
  p_transfer_id uuid,
  p_to_status text,
  p_items jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order public.stock_transfer_orders%ROWTYPE;
  v_allowed text[];
  v_item record;
  v_qty numeric;
  v_moved numeric := 0;
  v_divergence numeric := 0;
  v_final_status text := p_to_status;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.stock_transfer_orders WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada' USING ERRCODE = 'P0002';
  END IF;
  -- Própria empresa OU gestor do grupo executando a malha (a Central mostra
  -- o grupo inteiro; executar não pode exigir troca de contexto).
  IF v_order.company_id <> v_company
     AND NOT (
       public.is_group_manager(v_company)
       AND v_order.company_id IN (
         SELECT c.id FROM public.companies c
          WHERE c.id = public.company_group_root(v_company)
             OR c.parent_company_id = public.company_group_root(v_company)
       )
     ) THEN
    RAISE EXCEPTION 'Transferência de outra empresa' USING ERRCODE = '42501';
  END IF;

  -- Aprovar/rejeitar é decisão de gestor; o restante é operação da rede.
  IF p_to_status IN ('APROVADA', 'REJEITADA') AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid() AND ur.company_id = v_company
       AND ur.role IN ('admin', 'manager')
  ) AND NOT public.is_group_manager(v_company) THEN
    RAISE EXCEPTION 'Aprovação/rejeição é decisão do gestor (admin/manager)' USING ERRCODE = '42501';
  END IF;

  v_allowed := CASE v_order.current_status::text
    WHEN 'SUGERIDA' THEN ARRAY['APROVADA', 'REJEITADA', 'CANCELADA']
    WHEN 'APROVADA' THEN ARRAY['RESERVADA', 'CANCELADA']
    WHEN 'RESERVADA' THEN ARRAY['SEPARAÇÃO', 'CANCELADA']
    WHEN 'SEPARAÇÃO' THEN ARRAY['CONFERÊNCIA', 'CANCELADA']
    WHEN 'CONFERÊNCIA' THEN ARRAY['EXPEDIDA', 'CANCELADA']
    WHEN 'EXPEDIDA' THEN ARRAY['EM TRÂNSITO']
    WHEN 'EM TRÂNSITO' THEN ARRAY['RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA']
    WHEN 'RECEBIDA' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'RECEBIDA PARCIAL' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'RECEBIDA COM DIVERGÊNCIA' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'CONFERIDA' THEN ARRAY['ENCERRADA']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (p_to_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Transição inválida: % -> %', v_order.current_status, p_to_status USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.stock_transfer_rpc', 'on', true);

  IF p_to_status = 'EXPEDIDA' THEN
    FOR v_item IN
      SELECT ti.id, ti.product_id, ti.requested_qty, p.code, p.name
        FROM public.stock_transfer_items ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transfer_id = v_order.id
    LOOP
      v_qty := COALESCE(
        NULLIF((SELECT (e ->> 'quantity')::numeric FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
                 WHERE (e ->> 'item_id')::uuid = v_item.id), NULL),
        v_item.requested_qty);
      UPDATE public.stock_transfer_items SET shipped_qty = v_qty WHERE id = v_item.id;
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        v_order.company_id, v_order.origin_unit_id, v_item.product_id, v_item.code, v_item.name, v_qty,
        'out', 'transfer_out',
        public.stock_balance_canal(v_order.company_id, v_order.origin_unit_id, v_item.product_id, 'ATACADO_INDUSTRIA'),
        v_order.id::text, 'Expedição de transferência entre unidades', auth.uid()::text, 'stock_transfer'
      );
      v_moved := v_moved + v_qty;
    END LOOP;
    UPDATE public.stock_transfer_orders SET shipped_at = now() WHERE id = v_order.id;
  END IF;

  IF p_to_status IN ('RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA') THEN
    FOR v_item IN
      SELECT ti.id, ti.product_id, ti.requested_qty, ti.shipped_qty, p.code, p.name
        FROM public.stock_transfer_items ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transfer_id = v_order.id
    LOOP
      v_qty := COALESCE(
        NULLIF((SELECT (e ->> 'quantity')::numeric FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
                 WHERE (e ->> 'item_id')::uuid = v_item.id), NULL),
        v_item.shipped_qty, v_item.requested_qty);
      UPDATE public.stock_transfer_items SET received_qty = v_qty WHERE id = v_item.id;
      v_divergence := v_divergence + (COALESCE(v_item.shipped_qty, v_item.requested_qty) - v_qty);
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        v_order.company_id, v_order.destination_unit_id, v_item.product_id, v_item.code, v_item.name, v_qty,
        'in', 'transfer_in',
        public.stock_balance_canal(v_order.company_id, v_order.destination_unit_id, v_item.product_id, 'VAREJO_PDV'),
        v_order.id::text, 'Recebimento de transferência entre unidades', auth.uid()::text, 'stock_transfer'
      );
      v_moved := v_moved + v_qty;
    END LOOP;
    IF v_divergence > 0 AND p_to_status = 'RECEBIDA' THEN
      v_final_status := 'RECEBIDA COM DIVERGÊNCIA';
    END IF;
    UPDATE public.stock_transfer_orders SET received_at = now() WHERE id = v_order.id;
  END IF;

  UPDATE public.stock_transfer_orders
     SET current_status = v_final_status::public.transfer_workflow_status,
         approved_by = CASE WHEN p_to_status = 'APROVADA' THEN auth.uid() ELSE approved_by END
   WHERE id = v_order.id;

  INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, quantity, divergence, notes)
  VALUES (v_order.id, auth.uid(), v_final_status::public.transfer_workflow_status, v_moved, v_divergence, p_notes);

  RETURN jsonb_build_object(
    'id', v_order.id, 'from_status', v_order.current_status, 'status', v_final_status,
    'moved_quantity', v_moved, 'divergence', v_divergence
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transition_stock_transfer(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_stock_transfer(uuid, text, jsonb, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- b) Romaneio: cabeçalho do documento + vínculo nas transferências
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.stock_transfer_romaneios_numero_seq;

CREATE TABLE IF NOT EXISTS public.stock_transfer_romaneios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE
    DEFAULT ('ROM-' || lpad(nextval('public.stock_transfer_romaneios_numero_seq')::text, 6, '0')),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  origin_unit_id uuid NOT NULL REFERENCES public.branches(id),
  destination_unit_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'EMITIDO'
    CHECK (status IN ('EMITIDO', 'RECEBIDO', 'RECEBIDO COM DIVERGÊNCIA', 'CANCELADO')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES auth.users(id),
  received_at timestamptz
);

ALTER TABLE public.stock_transfer_orders
  ADD COLUMN IF NOT EXISTS romaneio_id uuid
  REFERENCES public.stock_transfer_romaneios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfer_orders_romaneio
  ON public.stock_transfer_orders (romaneio_id);

ALTER TABLE public.stock_transfer_romaneios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_transfer_romaneios_select" ON public.stock_transfer_romaneios;
CREATE POLICY "stock_transfer_romaneios_select" ON public.stock_transfer_romaneios
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

GRANT SELECT ON public.stock_transfer_romaneios TO authenticated;
GRANT ALL ON public.stock_transfer_romaneios TO service_role;

-- ----------------------------------------------------------------------------
-- c) O quadro do grupo passa a expor o romaneio de cada transferência
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_transfer_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
             'id', o.id,
             'company_id', o.company_id,
             'origin_unit_id', o.origin_unit_id,
             'destination_unit_id', o.destination_unit_id,
             'current_status', o.current_status,
             'notes', o.notes,
             'created_at', o.created_at,
             'updated_at', o.updated_at,
             'romaneio_id', o.romaneio_id,
             'items_count', (
               SELECT count(*)::int FROM public.stock_transfer_items i
                WHERE i.transfer_id = o.id
             )
           ) AS item,
           o.created_at
      FROM public.stock_transfer_orders o
     WHERE o.current_status NOT IN ('REJEITADA', 'CANCELADA')
       AND (
         (v_manager AND o.company_id IN (
           SELECT c.id FROM public.companies c
            WHERE c.id = v_root OR c.parent_company_id = v_root
         ))
         OR (NOT v_manager AND o.company_id = v_company)
       )
     ORDER BY o.created_at DESC
     LIMIT 200
  ) s;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.group_transfer_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_transfer_orders() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- d) Gerar o romaneio: agrupa, vincula e expede pela máquina oficial
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_romaneio(p_transfer_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_first public.stock_transfer_orders%ROWTYPE;
  v_order public.stock_transfer_orders%ROWTYPE;
  v_romaneio_id uuid;
  v_numero text;
  v_steps text[] := ARRAY['APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA', 'EM TRÂNSITO'];
  v_start int;
  v_i int;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_transfer_ids IS NULL OR cardinality(p_transfer_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma transferência para o romaneio' USING ERRCODE = '22023';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  SELECT * INTO v_first FROM public.stock_transfer_orders WHERE id = p_transfer_ids[1] FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Quem expede: a própria empresa dona das ordens ou o gestor do grupo.
  IF v_first.company_id <> v_company AND NOT (
    v_manager AND v_first.company_id IN (
      SELECT c.id FROM public.companies c
       WHERE c.id = v_root OR c.parent_company_id = v_root
    )
  ) THEN
    RAISE EXCEPTION 'Sem acesso às transferências deste romaneio' USING ERRCODE = '42501';
  END IF;

  FOR v_order IN
    SELECT * FROM public.stock_transfer_orders
     WHERE id = ANY (p_transfer_ids)
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF v_order.origin_unit_id <> v_first.origin_unit_id
       OR v_order.destination_unit_id <> v_first.destination_unit_id
       OR v_order.company_id <> v_first.company_id THEN
      RAISE EXCEPTION 'Um romaneio agrupa uma única carga: mesma origem, mesmo destino, mesma empresa' USING ERRCODE = '22023';
    END IF;
    IF v_order.romaneio_id IS NOT NULL THEN
      RAISE EXCEPTION 'A transferência % já está em um romaneio', left(v_order.id::text, 8) USING ERRCODE = '55000';
    END IF;
    IF v_order.current_status::text NOT IN ('SUGERIDA', 'APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA') THEN
      RAISE EXCEPTION 'A transferência % não está pronta para expedição (status %)', left(v_order.id::text, 8), v_order.current_status USING ERRCODE = '55000';
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> cardinality(p_transfer_ids) THEN
    RAISE EXCEPTION 'Alguma transferência selecionada não foi encontrada' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.stock_transfer_romaneios (company_id, origin_unit_id, destination_unit_id, created_by)
  VALUES (v_first.company_id, v_first.origin_unit_id, v_first.destination_unit_id, auth.uid())
  RETURNING id, numero INTO v_romaneio_id, v_numero;

  UPDATE public.stock_transfer_orders
     SET romaneio_id = v_romaneio_id
   WHERE id = ANY (p_transfer_ids);

  -- Anda cada transferência pela máquina oficial até EM TRÂNSITO: nenhum
  -- efeito de estoque é refeito aqui — a EXPEDIDA da máquina é quem baixa
  -- a origem pelo ledger; cada passo fica no histórico com o nº do romaneio.
  FOR v_order IN
    SELECT * FROM public.stock_transfer_orders
     WHERE id = ANY (p_transfer_ids)
     ORDER BY created_at
  LOOP
    v_start := CASE v_order.current_status::text
      WHEN 'SUGERIDA' THEN 1
      WHEN 'APROVADA' THEN 2
      WHEN 'RESERVADA' THEN 3
      WHEN 'SEPARAÇÃO' THEN 4
      WHEN 'CONFERÊNCIA' THEN 5
      WHEN 'EXPEDIDA' THEN 6
    END;
    FOR v_i IN v_start .. array_length(v_steps, 1) LOOP
      PERFORM public.transition_stock_transfer(v_order.id, v_steps[v_i], NULL, 'Romaneio ' || v_numero);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('id', v_romaneio_id, 'numero', v_numero, 'transfers', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.create_romaneio(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_romaneio(uuid[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- e) Recepcionar o romaneio na unidade destino (um ato, estoque alimentado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_romaneio(p_romaneio_id uuid, p_items jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_romaneio public.stock_transfer_romaneios%ROWTYPE;
  v_order public.stock_transfer_orders%ROWTYPE;
  v_subset jsonb;
  v_res jsonb;
  v_any_divergence boolean := false;
  v_final text;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_romaneio FROM public.stock_transfer_romaneios WHERE id = p_romaneio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Romaneio não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_romaneio.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'Romaneio % já foi recepcionado (status %)', v_romaneio.numero, v_romaneio.status USING ERRCODE = '55000';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  -- Quem recebe: a empresa destino do documento ou o gestor do grupo.
  IF v_romaneio.company_id <> v_company AND NOT (
    v_manager AND v_romaneio.company_id IN (
      SELECT c.id FROM public.companies c
       WHERE c.id = v_root OR c.parent_company_id = v_root
    )
  ) THEN
    RAISE EXCEPTION 'Este romaneio não é da sua empresa' USING ERRCODE = '42501';
  END IF;

  FOR v_order IN
    SELECT * FROM public.stock_transfer_orders
     WHERE romaneio_id = p_romaneio_id
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF v_order.current_status::text <> 'EM TRÂNSITO' THEN
      RAISE EXCEPTION 'A transferência % não está em trânsito (status %); recepcione-a individualmente', left(v_order.id::text, 8), v_order.current_status USING ERRCODE = '55000';
    END IF;
    SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_subset
      FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
     WHERE (e ->> 'item_id')::uuid IN (
       SELECT i.id FROM public.stock_transfer_items i WHERE i.transfer_id = v_order.id
     );
    v_res := public.transition_stock_transfer(v_order.id, 'RECEBIDA', v_subset, 'Recebimento do romaneio ' || v_romaneio.numero);
    IF (v_res ->> 'status') IN ('RECEBIDA COM DIVERGÊNCIA', 'RECEBIDA PARCIAL') THEN
      v_any_divergence := true;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Romaneio sem transferências vinculadas' USING ERRCODE = '55000';
  END IF;

  v_final := CASE WHEN v_any_divergence THEN 'RECEBIDO COM DIVERGÊNCIA' ELSE 'RECEBIDO' END;
  UPDATE public.stock_transfer_romaneios
     SET status = v_final, received_by = auth.uid(), received_at = now()
   WHERE id = p_romaneio_id;

  RETURN jsonb_build_object(
    'id', p_romaneio_id, 'numero', v_romaneio.numero, 'status', v_final, 'transfers', v_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.receive_romaneio(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_romaneio(uuid, jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- f) Leitura dos romaneios (gestor: grupo; demais: própria empresa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_romaneios()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
             'id', r.id,
             'numero', r.numero,
             'status', r.status,
             'company_id', r.company_id,
             'origin_unit_id', r.origin_unit_id,
             'destination_unit_id', r.destination_unit_id,
             'origin_name', ob.name,
             'destination_name', db.name,
             'created_at', r.created_at,
             'received_at', r.received_at,
             'transfers_count', (
               SELECT count(*)::int FROM public.stock_transfer_orders o
                WHERE o.romaneio_id = r.id
             ),
             'items_count', (
               SELECT count(*)::int FROM public.stock_transfer_items i
                 JOIN public.stock_transfer_orders o ON o.id = i.transfer_id
                WHERE o.romaneio_id = r.id
             ),
             'total_qty', (
               SELECT COALESCE(sum(i.requested_qty), 0) FROM public.stock_transfer_items i
                 JOIN public.stock_transfer_orders o ON o.id = i.transfer_id
                WHERE o.romaneio_id = r.id
             )
           ) AS item,
           r.created_at
      FROM public.stock_transfer_romaneios r
      LEFT JOIN public.branches ob ON ob.id = r.origin_unit_id
      LEFT JOIN public.branches db ON db.id = r.destination_unit_id
     WHERE (
         (v_manager AND r.company_id IN (
           SELECT c.id FROM public.companies c
            WHERE c.id = v_root OR c.parent_company_id = v_root
         ))
         OR (NOT v_manager AND r.company_id = v_company)
       )
     ORDER BY r.created_at DESC
     LIMIT 100
  ) s;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.group_romaneios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_romaneios() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- g) Documento do romaneio (impressão na expedição e conferência no destino)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_romaneio_detail(p_romaneio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_romaneio public.stock_transfer_romaneios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_romaneio FROM public.stock_transfer_romaneios WHERE id = p_romaneio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Romaneio não encontrado' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  IF v_romaneio.company_id <> v_company AND NOT (
    v_manager AND v_romaneio.company_id IN (
      SELECT c.id FROM public.companies c
       WHERE c.id = v_root OR c.parent_company_id = v_root
    )
  ) THEN
    RAISE EXCEPTION 'Sem acesso a este romaneio' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', v_romaneio.id,
    'numero', v_romaneio.numero,
    'status', v_romaneio.status,
    'company_id', v_romaneio.company_id,
    'origin_unit_id', v_romaneio.origin_unit_id,
    'destination_unit_id', v_romaneio.destination_unit_id,
    'origin_name', (SELECT name FROM public.branches WHERE id = v_romaneio.origin_unit_id),
    'destination_name', (SELECT name FROM public.branches WHERE id = v_romaneio.destination_unit_id),
    'created_at', v_romaneio.created_at,
    'received_at', v_romaneio.received_at,
    'transfers', COALESCE((
      SELECT jsonb_agg(t.item ORDER BY t.created_at)
      FROM (
        SELECT jsonb_build_object(
                 'id', o.id,
                 'current_status', o.current_status::text,
                 'created_at', o.created_at,
                 'items', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'id', i.id,
                              'product_id', i.product_id,
                              'requested_qty', i.requested_qty,
                              'shipped_qty', i.shipped_qty,
                              'received_qty', i.received_qty,
                              'product_name', p.name,
                              'product_code', p.code,
                              'image_url', p.image_url
                            ) ORDER BY i.created_at, i.id)
                     FROM public.stock_transfer_items i
                     LEFT JOIN public.products p ON p.id = i.product_id
                    WHERE i.transfer_id = o.id
                 ), '[]'::jsonb)
               ) AS item,
               o.created_at
          FROM public.stock_transfer_orders o
         WHERE o.romaneio_id = p_romaneio_id
      ) t
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.group_romaneio_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_romaneio_detail(uuid) TO authenticated, service_role;
