-- ============================================================================
-- Laboratório como portão da tinturaria (T84/P1, do manual PCP têxtil §8.8)
--
-- O perfil da OP de tinturaria ganha a decisão estruturada do laboratório
-- sobre a cor da partida (pendente/aprovada/rejeitada/concessão) e a marca
-- de exigência da empresa. Quando a aprovação é exigida, o banco bloqueia a
-- conclusão da OP (qualquer caminho que marque a OP como concluída) até a
-- decisão ser aprovada ou liberada sob concessão justificada. Sem a marca
-- de exigência, nada muda: nenhuma tolerância é presumida.
-- ============================================================================

ALTER TABLE public.dyeing_order_profiles
  ADD COLUMN IF NOT EXISTS lab_approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lab_decision text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS lab_decision_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS lab_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS lab_decision_notes text;

ALTER TABLE public.dyeing_order_profiles
  DROP CONSTRAINT IF EXISTS dyeing_order_profiles_lab_decision_check;
ALTER TABLE public.dyeing_order_profiles
  ADD CONSTRAINT dyeing_order_profiles_lab_decision_check
  CHECK (lab_decision IN ('pending', 'approved', 'rejected', 'concession'));

-- Marca/desmarca a exigência de aprovação do laboratório nesta OP.
CREATE OR REPLACE FUNCTION public.set_dyeing_lab_approval_requirement(
  p_production_order_id uuid,
  p_required boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_profile public.dyeing_order_profiles%ROWTYPE;
BEGIN
  PERFORM public.assert_sector_access('tinturaria', 'manager');
  IF p_required IS NULL THEN
    RAISE EXCEPTION 'Informe se a aprovação do laboratório é exigida' USING ERRCODE = '22023';
  END IF;

  UPDATE public.dyeing_order_profiles
     SET lab_approval_required = p_required, updated_at = now()
   WHERE production_order_id = v_order.id
   RETURNING * INTO v_profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salve o perfil de tinturaria antes de marcar a exigência do laboratório'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.set_dyeing_lab_approval_requirement(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_dyeing_lab_approval_requirement(uuid, boolean) TO authenticated, service_role;

-- Registra a decisão do laboratório sobre a cor da partida.
CREATE OR REPLACE FUNCTION public.decide_dyeing_lab_approval(
  p_production_order_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_profile public.dyeing_order_profiles%ROWTYPE;
  v_decision text := NULLIF(btrim(COALESCE(p_decision, '')), '');
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
BEGIN
  PERFORM public.assert_sector_access('tinturaria', 'manager');
  IF v_decision IS NULL OR v_decision NOT IN ('approved', 'rejected', 'concession') THEN
    RAISE EXCEPTION 'Decisão do laboratório deve ser aprovada, rejeitada ou concessão'
      USING ERRCODE = '22023';
  END IF;
  IF v_decision = 'concession' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'Liberação sob concessão exige a justificativa registrada'
      USING ERRCODE = '22023';
  END IF;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Decisão do laboratório não muda em OP concluída/cancelada'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.dyeing_order_profiles
     SET lab_decision = v_decision,
         lab_decision_by = auth.uid(),
         lab_decision_at = now(),
         lab_decision_notes = v_notes,
         updated_at = now()
   WHERE production_order_id = v_order.id
   RETURNING * INTO v_profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salve o perfil de tinturaria antes da decisão do laboratório'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_dyeing_lab_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_dyeing_lab_approval(uuid, text, text) TO authenticated, service_role;

-- Portão: OP de tinturaria com aprovação exigida não conclui sem decisão
-- aprovada ou concessão. A checagem entra na própria guarda de conclusão
-- verificada (antes da exigência da transação de conclusão), para valer em
-- qualquer caminho e com a mensagem certa.
CREATE OR REPLACE FUNCTION public.block_unverified_production_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.dyeing_order_profiles%ROWTYPE;
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO v_profile
      FROM public.dyeing_order_profiles
     WHERE production_order_id = NEW.id;
    IF FOUND AND v_profile.lab_approval_required
       AND v_profile.lab_decision NOT IN ('approved', 'concession') THEN
      RAISE EXCEPTION 'OP de tinturaria exige aprovação do laboratório antes de concluir (decisão atual: %)', v_profile.lab_decision
        USING ERRCODE = '23514';
    END IF;
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

COMMENT ON COLUMN public.dyeing_order_profiles.lab_approval_required IS
  'Quando verdadeiro (configuração da empresa), a OP só conclui com a cor aprovada ou liberada sob concessão.';
COMMENT ON COLUMN public.dyeing_order_profiles.lab_decision IS
  'Decisão do laboratório sobre a cor da partida: pendente, aprovada, rejeitada ou concessão justificada.';
