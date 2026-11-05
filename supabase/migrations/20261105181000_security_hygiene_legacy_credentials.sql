-- SEC-02 — Higiene de segredos e configuracao (05/11/2026)
--
-- O repositorio versionava `.env` e varias migrations continham URL + JWT
-- `anon` fixos apontando para um projeto legado. Esta migration NAO reescreve
-- o historico Git. Ela neutraliza os objetos ativos e passa a exigir
-- configuracao explicita do ambiente; os literais tambem foram substituidos
-- por current_setting nas migrations anteriores, para que um replay parcial
-- nao recrie agendamentos apontando para o projeto errado.
--
-- Nenhuma chave, URL de projeto ou token e gravado aqui. Configure fora do
-- repositorio (ver docs/ENVIRONMENT.md, secao 0):
--   app.settings.supabase_url       -> https://<SEU-PROJETO>.supabase.co
--   app.settings.supabase_anon_key  -> chave publicavel do seu projeto
--
-- Sem esses valores o comportamento e FAIL-CLOSED: nenhum HTTP externo e
-- disparado e os agendamentos legados permanecem desativados.

-- 1) Remove os jobs pg_cron que embutiam Bearer/URL do projeto antigo.
--    Nao os recria: reagendar e uma decisao de implantacao.
DO $$
DECLARE
  v_name text;
  v_jobs text[] := ARRAY[
    'ai-brain-daily-autopilot',
    'wms-intelligence-30min',
    'wms-slotting-daily',
    'alert-sla-warning'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_jobs
  LOOP
    BEGIN
      PERFORM cron.unschedule(v_name);
    EXCEPTION WHEN OTHERS THEN
      -- Job ausente nao e erro de replay.
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'SEC-02: % agendamentos legados neutralizados', cardinality(v_jobs);
END $$;

-- 2) Versao final do trigger de incidente critico. Antes ele continha
--    `fn_url` e `anon_key` literais. Agora le a configuracao do banco e,
--    se ausente, apenas registra o incidente sem chamar servico externo.
--    O trigger trg_notify_incident_email ja aponta para esta funcao.
CREATE OR REPLACE FUNCTION public.tg_notify_incident_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_anon_key text := nullif(current_setting('app.settings.supabase_anon_key', true), '');
BEGIN
  IF NEW.severity = 'critical'
     AND v_base_url IS NOT NULL
     AND v_anon_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/notify-incident-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('incident_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_notify_incident_email() IS
  'Fail-closed: notifica incidente critico apenas com app.settings.supabase_url e app.settings.supabase_anon_key definidos; sem configuracao, nao dispara HTTP.';
