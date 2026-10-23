-- ============================================================================
-- Prontidão fiscal: gate de homologação sobre a orquestração EXISTENTE
--
-- A fila oficial é fiscal_emission_jobs + enqueue_fiscal_emission(text,uuid,
-- jsonb) (20260910130000). Esta migration NÃO cria fila paralela: apenas
-- (1) adiciona o gate em fiscal_provider_settings — emission_enabled exige
-- provedor + certificado + homologação aprovada, imposto por CHECK;
-- (2) faz o enqueue respeitar o gate: sem liberação, levanta exceção e
-- NENHUM job é criado (nada emitido nem simulado).
-- ============================================================================


-- Autocorreção: remove eventual fila paralela de uma versão preliminar
-- desta migration (a fila oficial é fiscal_emission_jobs).
DROP TABLE IF EXISTS public.fiscal_emission_queue;
DROP FUNCTION IF EXISTS public.enqueue_fiscal_emission(uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.claim_fiscal_emissions(int);
DROP FUNCTION IF EXISTS public.complete_fiscal_emission(uuid, text, text, text, text, text, text);

ALTER TABLE public.fiscal_provider_settings
  ADD COLUMN IF NOT EXISTS homologation_approved_at date,
  ADD COLUMN IF NOT EXISTS emission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_token_ref text;

ALTER TABLE public.fiscal_provider_settings
  DROP CONSTRAINT IF EXISTS fiscal_emission_gate;
ALTER TABLE public.fiscal_provider_settings
  ADD CONSTRAINT fiscal_emission_gate CHECK (
    NOT emission_enabled
    OR (homologation_approved_at IS NOT NULL
        AND certificate_expires_at IS NOT NULL
        AND provider <> 'nao_definido')
  );

CREATE OR REPLACE FUNCTION public.enqueue_fiscal_emission(
  _document_type text,
  _document_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS public.fiscal_emission_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_branch uuid := public.get_user_branch_id(auth.uid());
  v_document_company uuid;
  v_document_branch uuid;
  v_channel public.canal_operacional;
  v_job public.fiscal_emission_jobs;
  v_key text;
  v_emission_enabled boolean;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'Tenant fiscal não resolvido';
  END IF;
  IF _document_type NOT IN ('nfe', 'nfce', 'nfse', 'cte', 'mdfe') THEN
    RAISE EXCEPTION 'Tipo de documento fiscal inválido';
  END IF;

  -- GATE DE HOMOLOGAÇÃO: sem provedor configurado + homologação aprovada +
  -- emissão liberada, nenhum job entra na fila.
  SELECT emission_enabled INTO v_emission_enabled
    FROM public.fiscal_provider_settings WHERE company_id = v_company;
  IF NOT COALESCE(v_emission_enabled, false) THEN
    RAISE EXCEPTION 'Emissão bloqueada: homologação fiscal não aprovada/liberada para esta empresa (Fiscal > NF-e).'
      USING ERRCODE = '42501';
  END IF;

  CASE _document_type
    WHEN 'nfe' THEN
      SELECT company_id, branch_id, canal_operacional INTO v_document_company, v_document_branch, v_channel FROM public.nfe WHERE id = _document_id;
    WHEN 'nfce' THEN
      SELECT company_id, branch_id, canal_operacional INTO v_document_company, v_document_branch, v_channel FROM public.nfce WHERE id = _document_id;
    WHEN 'nfse' THEN
      SELECT company_id, branch_id, canal_operacional INTO v_document_company, v_document_branch, v_channel FROM public.nfse WHERE id = _document_id;
    WHEN 'cte' THEN
      SELECT company_id, branch_id, canal_operacional INTO v_document_company, v_document_branch, v_channel FROM public.cte WHERE id = _document_id;
    WHEN 'mdfe' THEN
      SELECT company_id, branch_id, canal_operacional INTO v_document_company, v_document_branch, v_channel FROM public.mdfe WHERE id = _document_id;
  END CASE;

  IF v_document_company IS NULL OR v_document_company <> v_company THEN
    RAISE EXCEPTION 'Documento fiscal não pertence ao tenant atual';
  END IF;
  IF v_document_branch IS NULL OR (v_document_branch <> v_branch AND NOT public.is_matriz_viewer(auth.uid())) THEN
    RAISE EXCEPTION 'Documento fiscal não pertence à filial atual';
  END IF;

  v_key := _document_type || ':' || _document_id::text;
  INSERT INTO public.fiscal_emission_jobs (
    document_type, document_id, company_id, branch_id, canal_operacional,
    idempotency_key, payload, created_by
  ) VALUES (
    _document_type, _document_id, v_company, v_document_branch, v_channel,
    v_key, COALESCE(_payload, '{}'::jsonb), auth.uid()
  )
  ON CONFLICT (company_id, idempotency_key) DO UPDATE
    SET payload = EXCLUDED.payload
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;
