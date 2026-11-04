-- ============================================================================
-- Sequenciamento formal por cor/contaminação por máquina (T90/P1, manual §8)
--
-- O cadastro de equipamentos ganha a regra de sequenciamento de cor que a
-- empresa validar para a máquina ('light_to_dark': do claro para o escuro).
-- Com a regra configurada, a programação finita valida as partidas vizinhas
-- na mesma máquina usando o L* alvo (CIELAB) do perfil de tinturaria:
-- clareamento (partida mais clara depois de uma mais escura) é rejeitado.
-- Sem regra configurada, ou sem L* informado nas partidas, nada é presumido
-- nem bloqueado — a sugestão claro->escuro da tela continua sendo sugestão.
-- ============================================================================

ALTER TABLE public.production_machines
  ADD COLUMN IF NOT EXISTS color_sequencing_rule text;

ALTER TABLE public.production_machines
  DROP CONSTRAINT IF EXISTS production_machines_color_sequencing_check;
ALTER TABLE public.production_machines
  ADD CONSTRAINT production_machines_color_sequencing_check CHECK (
    color_sequencing_rule IS NULL OR color_sequencing_rule IN ('light_to_dark')
  );

COMMENT ON COLUMN public.production_machines.color_sequencing_rule IS
  'Regra formal de sequenciamento de cor validada pela empresa (light_to_dark); nunca presumida.';

-- Programação finita: corpo vigente (20261028210000, com tempos de troca),
-- acrescido apenas da barreira de sequenciamento de cor por máquina.
CREATE OR REPLACE FUNCTION public.schedule_production_order(
  p_production_order_id uuid,
  p_planned_start timestamptz,
  p_planned_end timestamptz,
  p_idempotency_key text,
  p_resource_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_work_center text DEFAULT NULL,
  p_sector text DEFAULT NULL,
  p_shift text DEFAULT 'diurno'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_resource public.production_resources%ROWTYPE;
  v_machine public.production_machines%ROWTYPE;
  v_work_center text := NULLIF(btrim(p_work_center), '');
  v_resource_key text;
  v_existing public.production_schedule%ROWTYPE;
  v_schedule_id uuid;
  v_window_minutes numeric;
  v_capacity record;
  v_setup_minutes numeric := 0;
  v_cleaning_minutes numeric := 0;
  v_color_rule text;
  v_new_lab numeric;
  v_prev_lab numeric;
  v_next_lab numeric;
BEGIN
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_planned_start IS NULL OR p_planned_end IS NULL OR p_planned_end <= p_planned_start THEN
    RAISE EXCEPTION 'Janela planejada inválida' USING ERRCODE = '22023';
  END IF;
  IF v_order.status NOT IN ('planned','in_progress','paused','waiting_material') THEN
    RAISE EXCEPTION 'OP não pode ser programada no status %', v_order.status USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_existing FROM public.production_schedule
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_order_id <> v_order.id THEN
      RAISE EXCEPTION 'idempotency_key já foi utilizada para outra OP' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('schedule_id', v_existing.id, 'production_order_id', v_order.id,
      'status', v_existing.status, 'idempotent_replay', true);
  END IF;

  IF p_resource_id IS NOT NULL THEN
    SELECT * INTO v_resource FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id;
    IF NOT FOUND OR NOT v_resource.is_active OR lower(v_resource.status) IN ('maintenance','inactive','down') THEN
      RAISE EXCEPTION 'Recurso inexistente, inativo ou em manutenção' USING ERRCODE = '23514';
    END IF;
    v_work_center := COALESCE(v_work_center, v_resource.name);
  END IF;
  IF p_machine_id IS NOT NULL THEN
    SELECT * INTO v_machine FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id;
    IF NOT FOUND OR NOT v_machine.active OR lower(v_machine.status) IN ('maintenance','inactive','down') THEN
      RAISE EXCEPTION 'Máquina inexistente, inativa ou em manutenção' USING ERRCODE = '23514';
    END IF;
    v_work_center := COALESCE(v_work_center, v_machine.name);
    v_setup_minutes := COALESCE(v_machine.setup_time_minutes, 0);
    v_cleaning_minutes := COALESCE(v_machine.cleaning_time_minutes, 0);
    v_color_rule := v_machine.color_sequencing_rule;
  END IF;
  IF v_work_center IS NULL AND NULLIF(btrim(p_sector), '') IS NULL THEN
    RAISE EXCEPTION 'Informe recurso, máquina, centro de trabalho ou setor+turno para programação finita' USING ERRCODE = '22023';
  END IF;

  v_resource_key := CASE
    WHEN p_machine_id IS NOT NULL THEN 'machine:' || p_machine_id::text
    WHEN p_resource_id IS NOT NULL THEN 'resource:' || p_resource_id::text
    WHEN v_work_center IS NOT NULL THEN 'work-center:' || lower(btrim(v_work_center))
    ELSE 'sector-shift:' || lower(btrim(p_sector)) || ':' || lower(COALESCE(p_shift, 'diurno'))
  END;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_order.company_id::text || ':' || v_resource_key, 0));

  IF EXISTS (
    SELECT 1 FROM public.production_schedule
     WHERE company_id = v_order.company_id AND production_order_id = v_order.id
       AND status IN ('scheduled','in_progress')
  ) THEN RAISE EXCEPTION 'OP já possui janela ativa; cancele ou encerre antes de reprogramar' USING ERRCODE = '23505'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_schedule s
     WHERE s.company_id = v_order.company_id
       AND s.status IN ('scheduled','in_progress')
       AND s.planned_start < p_planned_end AND p_planned_start < s.planned_end
       AND (
         (p_machine_id IS NOT NULL AND s.machine_id = p_machine_id)
         OR (p_resource_id IS NOT NULL AND s.resource_id = p_resource_id)
         OR (v_work_center IS NOT NULL AND lower(COALESCE(s.work_center, '')) = lower(v_work_center))
         OR (p_machine_id IS NULL AND p_resource_id IS NULL AND v_work_center IS NULL
             AND lower(COALESCE(s.sector, '')) = lower(p_sector)
             AND lower(COALESCE(s.shift, 'diurno')) = lower(COALESCE(p_shift, 'diurno')))
       )
  ) THEN RAISE EXCEPTION 'Conflito de capacidade: recurso já alocado nesta janela' USING ERRCODE = '23505'; END IF;

  -- Troca de artigo/cor na mesma máquina: a máquina fica ocupada também no
  -- setup (antes) e na limpeza (depois) de cada produção. Sem tempos
  -- configurados na máquina, nenhuma ocupação adicional é presumida.
  IF p_machine_id IS NOT NULL AND (v_setup_minutes > 0 OR v_cleaning_minutes > 0) THEN
    IF EXISTS (
      SELECT 1 FROM public.production_schedule s
        JOIN public.production_orders po ON po.id = s.production_order_id
       WHERE s.company_id = v_order.company_id
         AND s.status IN ('scheduled','in_progress')
         AND s.machine_id = p_machine_id
         AND po.product_id <> v_order.product_id
         AND s.planned_start - (v_setup_minutes * interval '1 minute')
             < p_planned_end + (v_cleaning_minutes * interval '1 minute')
         AND p_planned_start - (v_setup_minutes * interval '1 minute')
             < s.planned_end + (v_cleaning_minutes * interval '1 minute')
    ) THEN
      RAISE EXCEPTION 'Conflito de capacidade: troca de artigo na máquina % exige % min entre produções (setup % min + limpeza % min)',
        v_machine.code, v_setup_minutes + v_cleaning_minutes, v_setup_minutes, v_cleaning_minutes
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Sequenciamento de cor formal (claro -> escuro) quando a empresa
  -- configurou a regra nesta máquina: as partidas vizinhas são comparadas
  -- pelo L* alvo do perfil de tinturaria. Sem L* informado, não há
  -- referência para validar e nada é bloqueado.
  IF p_machine_id IS NOT NULL AND v_color_rule = 'light_to_dark' THEN
    SELECT lab_l INTO v_new_lab
      FROM public.dyeing_order_profiles
     WHERE production_order_id = v_order.id;
    IF v_new_lab IS NOT NULL THEN
      SELECT dp.lab_l INTO v_prev_lab
        FROM public.production_schedule s
        JOIN public.dyeing_order_profiles dp ON dp.production_order_id = s.production_order_id
       WHERE s.company_id = v_order.company_id
         AND s.status IN ('scheduled','in_progress')
         AND s.machine_id = p_machine_id
         AND s.planned_end <= p_planned_start
         AND dp.lab_l IS NOT NULL
       ORDER BY s.planned_end DESC
       LIMIT 1;
      IF v_prev_lab IS NOT NULL AND v_new_lab > v_prev_lab THEN
        RAISE EXCEPTION 'Sequenciamento de cor: máquina % segue claro para escuro; partida com L* % depois de L* % é clareamento e exige revisão da sequência (ou lavagem registrada)',
          v_machine.code, v_new_lab, v_prev_lab USING ERRCODE = '23505';
      END IF;
      SELECT dp.lab_l INTO v_next_lab
        FROM public.production_schedule s
        JOIN public.dyeing_order_profiles dp ON dp.production_order_id = s.production_order_id
       WHERE s.company_id = v_order.company_id
         AND s.status IN ('scheduled','in_progress')
         AND s.machine_id = p_machine_id
         AND s.planned_start >= p_planned_end
         AND dp.lab_l IS NOT NULL
       ORDER BY s.planned_start ASC
       LIMIT 1;
      IF v_next_lab IS NOT NULL AND v_next_lab > v_new_lab THEN
        RAISE EXCEPTION 'Sequenciamento de cor: máquina % segue claro para escuro; partida com L* % antes de L* % deixaria a próxima em clareamento',
          v_machine.code, v_new_lab, v_next_lab USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  v_window_minutes := EXTRACT(EPOCH FROM (p_planned_end - p_planned_start)) / 60;
  IF COALESCE(v_order.estimated_time_minutes, 0) > 0 AND v_window_minutes < v_order.estimated_time_minutes THEN
    RAISE EXCEPTION 'Janela de % min é menor que o tempo estimado da OP (% min)', round(v_window_minutes), v_order.estimated_time_minutes
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_capacity FROM public.production_capacity
   WHERE company_id = v_order.company_id AND is_active
     AND ((v_machine.name IS NOT NULL AND machine = v_machine.name)
       OR (NULLIF(btrim(p_sector), '') IS NOT NULL AND sector = p_sector AND shift = COALESCE(p_shift, 'diurno')))
   ORDER BY id LIMIT 1;
  IF FOUND AND v_capacity.max_hours_per_day > 0 AND v_window_minutes > v_capacity.max_hours_per_day * 60 THEN
    RAISE EXCEPTION 'Janela excede o máximo configurado de % h/dia para o recurso/setor', v_capacity.max_hours_per_day
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_schedule (
    company_id, production_order_id, planned_start, planned_end, sector,
    work_center, shift, resource_id, machine_id, status, idempotency_key
  ) VALUES (
    v_order.company_id, v_order.id, p_planned_start, p_planned_end,
    NULLIF(btrim(p_sector), ''), v_work_center, COALESCE(NULLIF(btrim(p_shift), ''), 'diurno'),
    p_resource_id, p_machine_id, 'scheduled', v_key
  ) RETURNING id INTO v_schedule_id;

  RETURN jsonb_build_object('schedule_id', v_schedule_id, 'production_order_id', v_order.id,
    'resource_key', v_resource_key, 'status', 'scheduled', 'idempotent_replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_production_order(uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_production_order(uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text) TO authenticated, service_role;
