-- SEC-03 — search_path explicito em funcoes privilegiadas (05/11/2026)
--
-- 33 migrations criavam funcoes SECURITY DEFINER sem `SET search_path`, 10 delas
-- com GRANT EXECUTE a `authenticated`. Em funcoes privilegiadas, depender do
-- search_path da sessao permite que um objeto criado em um schema anterior da
-- lista seja resolvido no lugar do objeto legitimo.
--
-- Esta migration e corretiva e idempotente: varre o catalogo ao final do replay
-- e aplica `SET search_path = public, pg_temp` em TODA funcao SECURITY DEFINER
-- do schema public que ainda nao tenha search_path explicito. Nao reescreve as
-- migrations historicas nem altera grants. Referencias a outros schemas
-- (auth.*, storage.*) ja sao qualificadas no codigo existente.
--
-- A assercao correspondente no harness (`tests/harness/harness.mjs`) torna este
-- um GATE PERMANENTE: qualquer migration futura que criar funcao privilegiada
-- sem search_path reprova o replay no CI.

DO $$
DECLARE
  v_target record;
  v_changed int := 0;
  v_remaining int;
BEGIN
  FOR v_target IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) AS c(item)
          WHERE c.item LIKE 'search_path=%'
            AND length(c.item) > length('search_path=')
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp',
      v_target.signature
    );
    v_changed := v_changed + 1;
  END LOOP;

  SELECT count(*) INTO v_remaining
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.prosecdef
    AND (
      p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) AS c(item)
        WHERE c.item LIKE 'search_path=%'
          AND length(c.item) > length('search_path=')
      )
    );

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'SEC-03: % funcoes SECURITY DEFINER ainda sem search_path explicito', v_remaining;
  END IF;

  RAISE NOTICE 'SEC-03: % funcoes receberam search_path public, pg_temp; restantes=0', v_changed;
END $$;
