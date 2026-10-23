-- ============================================================================
-- Classificação de desvios nos eventos setoriais de produção.
--
-- As skills operacionais de PCP (fiação, tecelagem/malharia e tinturaria)
-- exigem que toda parada/desvio seja CLASSIFICADA na taxonomia do próprio
-- setor, com causa "em investigação" até confirmação do responsável —
-- nunca presumida. Esta migration adiciona, de forma incremental e
-- compatível com os dados existentes:
--
--   sector_production_events.deviation_category / cause_status
--   weaving_production_events.deviation_category / cause_status
--
-- e recria record_sector_event / record_weaving_event com dois parâmetros
-- OPCIONAIS ao final (p_deviation_category, p_cause_status). As assinaturas
-- antigas são removidas para não haver ambiguidade de overload no
-- PostgREST; chamadas existentes (sem os novos argumentos) continuam
-- válidas porque os parâmetros têm DEFAULT NULL.
-- ============================================================================

ALTER TABLE public.sector_production_events
  ADD COLUMN IF NOT EXISTS deviation_category text;
ALTER TABLE public.sector_production_events
  ADD COLUMN IF NOT EXISTS cause_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sector_events_deviation_category_check'
  ) THEN
    ALTER TABLE public.sector_production_events
      ADD CONSTRAINT sector_events_deviation_category_check CHECK (
        deviation_category IS NULL OR deviation_category IN (
          'material', 'maquina', 'qualidade', 'mao_de_obra', 'metodo',
          'energia_utilidades', 'programacao',
          'cor', 'substrato', 'receita', 'produto_quimico', 'utilidade',
          'tempo', 'manutencao', 'laboratorio', 'planejamento'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sector_events_cause_status_check'
  ) THEN
    ALTER TABLE public.sector_production_events
      ADD CONSTRAINT sector_events_cause_status_check CHECK (
        cause_status IS NULL OR cause_status IN ('confirmada', 'em_investigacao')
      );
  END IF;
END $$;

ALTER TABLE public.weaving_production_events
  ADD COLUMN IF NOT EXISTS deviation_category text;
ALTER TABLE public.weaving_production_events
  ADD COLUMN IF NOT EXISTS cause_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weaving_events_deviation_category_check'
  ) THEN
    ALTER TABLE public.weaving_production_events
      ADD CONSTRAINT weaving_events_deviation_category_check CHECK (
        deviation_category IS NULL OR deviation_category IN (
          'fio_urdume', 'fio_trama', 'maquina', 'preparacao', 'qualidade',
          'operacao', 'material', 'programacao'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weaving_events_cause_status_check'
  ) THEN
    ALTER TABLE public.weaving_production_events
      ADD CONSTRAINT weaving_events_cause_status_check CHECK (
        cause_status IS NULL OR cause_status IN ('confirmada', 'em_investigacao')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- record_sector_event: mesma validação de 20261019180000 + classificação.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.record_sector_event(
  p_production_order_id uuid,
  p_sector text,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_downtime_minutes numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_deviation_category text DEFAULT NULL,
  p_cause_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_event_id uuid;
  v_allowed text[];
  v_categories text[];
BEGIN
  v_allowed := CASE p_sector
    WHEN 'fiacao' THEN ARRAY['setup','start','pause','resume','stop','doffing','fiber_break','quality_hold','quality_release','inspection','note']
    WHEN 'malharia' THEN ARRAY['setup','start','pause','resume','stop','yarn_break','roll_change','quality_hold','quality_release','inspection','note']
    WHEN 'tinturaria' THEN ARRAY['setup','start','pause','resume','stop','bath_start','wash','unload','color_hold','color_release','re_dye','quality_hold','quality_release','inspection','note']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Setor sem eventos próprios nesta função: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Tipo de evento inválido para o setor %: %', p_sector, COALESCE(p_event_type, '(nulo)') USING ERRCODE = '22023';
  END IF;
  v_categories := CASE p_sector
    WHEN 'tinturaria' THEN ARRAY['cor','substrato','maquina','receita','produto_quimico','utilidade','tempo','qualidade','manutencao','laboratorio','planejamento']
    ELSE ARRAY['material','maquina','qualidade','mao_de_obra','metodo','energia_utilidades','programacao']
  END;
  IF p_deviation_category IS NOT NULL AND NOT (p_deviation_category = ANY (v_categories)) THEN
    RAISE EXCEPTION 'Categoria de desvio inválida para o setor %: %', p_sector, p_deviation_category USING ERRCODE = '22023';
  END IF;
  IF p_cause_status IS NOT NULL AND p_cause_status NOT IN ('confirmada', 'em_investigacao') THEN
    RAISE EXCEPTION 'Situação da causa inválida: %', p_cause_status USING ERRCODE = '22023';
  END IF;
  IF p_production_order_step_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_steps WHERE id = p_production_order_step_id
      AND production_order_id = v_order.id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Etapa não pertence à OP' USING ERRCODE = '42501'; END IF;
  IF p_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Máquina não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF p_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Recurso não pertence à empresa' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.sector_production_events (
    company_id, branch_id, production_order_id, production_order_step_id,
    machine_id, resource_id, sector, event_type, quantity, downtime_minutes,
    reason, operator_name, deviation_category, cause_status, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, p_production_order_step_id,
    p_machine_id, p_resource_id, p_sector, p_event_type, p_quantity, p_downtime_minutes,
    NULLIF(btrim(p_reason), ''), NULLIF(btrim(p_operator_name), ''),
    p_deviation_category, p_cause_status, auth.uid()
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('event_id', v_event_id, 'production_order_id', v_order.id, 'sector', p_sector, 'event_type', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_weaving_event: idem, com a taxonomia de causas da tecelagem plana.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.record_weaving_event(
  p_production_order_id uuid,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity_m numeric DEFAULT NULL,
  p_downtime_minutes numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_deviation_category text DEFAULT NULL,
  p_cause_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN ('setup','start','pause','resume','stop','yarn_break','warp_break','weft_break','beam_change','quality_hold','quality_release','inspection','note') THEN
    RAISE EXCEPTION 'Tipo de evento de tecelagem inválido' USING ERRCODE = '22023';
  END IF;
  IF p_deviation_category IS NOT NULL AND p_deviation_category NOT IN (
    'fio_urdume', 'fio_trama', 'maquina', 'preparacao', 'qualidade', 'operacao', 'material', 'programacao'
  ) THEN
    RAISE EXCEPTION 'Categoria de desvio inválida para tecelagem: %', p_deviation_category USING ERRCODE = '22023';
  END IF;
  IF p_cause_status IS NOT NULL AND p_cause_status NOT IN ('confirmada', 'em_investigacao') THEN
    RAISE EXCEPTION 'Situação da causa inválida: %', p_cause_status USING ERRCODE = '22023';
  END IF;
  IF p_production_order_step_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_steps WHERE id = p_production_order_step_id
      AND production_order_id = v_order.id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Etapa não pertence à OP' USING ERRCODE = '42501'; END IF;
  IF p_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Máquina não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF p_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Recurso não pertence à empresa' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.weaving_production_events (
    company_id, branch_id, production_order_id, production_order_step_id,
    machine_id, resource_id, event_type, quantity_m, downtime_minutes, reason,
    operator_name, deviation_category, cause_status, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, p_production_order_step_id,
    p_machine_id, p_resource_id, p_event_type, p_quantity_m, p_downtime_minutes,
    NULLIF(btrim(p_reason), ''), NULLIF(btrim(p_operator_name), ''),
    p_deviation_category, p_cause_status, auth.uid()
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('event_id', v_event_id, 'production_order_id', v_order.id, 'event_type', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) TO authenticated, service_role;
