-- ============================================================================
-- Fila fiscal: falha transitória NÃO vira rejeição definitiva (T97)
--
-- Problema: o worker só tinha complete_fiscal_emission (authorized/rejected/
-- cancelled). Qualquer falha — provedor ainda "processando" (fluxo assíncrono
-- da Focus), token ainda não salvo pelo cliente, erro de rede/HTTP 5xx —
-- marcava o job como rejected para sempre, e um job travado em 'processing'
-- (worker interrompido) nunca voltava para a fila.
--
-- Correção, sem inventar status novo:
-- 1) claim_fiscal_jobs passa a gravar started_at (base da detecção de trava);
-- 2) requeue_fiscal_emission: devolve job 'processing' para 'queued' com o
--    erro registrado; ao atingir o teto de tentativas, encerra como
--    'rejected' (definitivo, com o motivo em last_error);
-- 3) recover_stale_fiscal_jobs: jobs 'processing' parados além do limite são
--    reenfileirados (ou rejeitados, se as tentativas esgotaram).
-- Só o service_role (worker) executa as três.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_fiscal_jobs(p_limit int DEFAULT 10)
RETURNS SETOF public.fiscal_emission_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.fiscal_emission_jobs j
     SET status = 'processing',
         attempt_count = attempt_count + 1,
         started_at = now(),
         completed_at = NULL
   WHERE j.id IN (
     SELECT id FROM public.fiscal_emission_jobs
      WHERE status = 'queued' ORDER BY queued_at LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_fiscal_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_jobs(int) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_fiscal_emission(
  _job_id uuid,
  _error text,
  _max_attempts int DEFAULT 5
) RETURNS public.fiscal_emission_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.fiscal_emission_jobs;
BEGIN
  SELECT * INTO v_job FROM public.fiscal_emission_jobs WHERE id = _job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Fila de emissão não encontrada';
  END IF;
  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'Só é possível reenfileirar job em processamento (status atual: %)', v_job.status;
  END IF;

  IF v_job.attempt_count >= GREATEST(_max_attempts, 1) THEN
    UPDATE public.fiscal_emission_jobs
       SET status = 'rejected',
           last_error = left(COALESCE(NULLIF(btrim(COALESCE(_error, '')), ''), 'falha não informada')
                        || ' (tentativas esgotadas: ' || v_job.attempt_count || ')', 1000),
           completed_at = now()
     WHERE id = _job_id
     RETURNING * INTO v_job;
  ELSE
    UPDATE public.fiscal_emission_jobs
       SET status = 'queued',
           last_error = left(COALESCE(NULLIF(btrim(COALESCE(_error, '')), ''), 'falha não informada'), 1000),
           started_at = NULL
     WHERE id = _job_id
     RETURNING * INTO v_job;
  END IF;
  RETURN v_job;
END $$;
REVOKE ALL ON FUNCTION public.requeue_fiscal_emission(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_fiscal_emission(uuid, text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_fiscal_jobs(
  _stale_minutes int DEFAULT 15,
  _max_attempts int DEFAULT 5
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id FROM public.fiscal_emission_jobs
     WHERE status = 'processing'
       AND COALESCE(started_at, queued_at) < now() - make_interval(mins => GREATEST(_stale_minutes, 1))
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.requeue_fiscal_emission(
      v_row.id,
      'worker interrompido durante o processamento (recuperação automática)',
      _max_attempts
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.recover_stale_fiscal_jobs(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_fiscal_jobs(int, int) TO service_role;
