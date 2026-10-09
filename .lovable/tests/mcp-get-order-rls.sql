-- =====================================================================
-- Verificação estática de RLS multi-tenant para a ferramenta MCP `get_order`
-- =====================================================================
-- A tool `get_order` (src/lib/mcp/tools/get-order.ts) usa um Supabase client
-- criado com o access_token do usuário autenticado — portanto TODA a
-- proteção contra vazamento cross-tenant depende das policies RLS de
-- `public.orders` e `public.order_items`.
--
-- Este script confere, sem privilégios de superuser, que:
--   1. RLS está habilitado em ambas as tabelas
--   2. company_id em `orders` é NOT NULL (não pode existir pedido "órfão")
--   3. A policy de SELECT filtra por company_id = get_user_company_id(auth.uid())
--   4. Não há nenhuma policy SELECT permissiva ("qual = true") na base
--   5. order_items só é visível via join escopado ao pedido do tenant
--
-- Uso:
--   psql -f .lovable/tests/mcp-get-order-rls.sql
-- =====================================================================

\echo '── 1. RLS habilitado + company_id NOT NULL ─────────────────────────'
WITH t AS (SELECT unnest(ARRAY['orders','order_items']) AS tbl)
SELECT
  t.tbl AS table_name,
  CASE WHEN (SELECT relrowsecurity FROM pg_class c
              JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname=t.tbl)
       THEN 'PASS' ELSE 'FAIL' END AS rls_enabled,
  CASE WHEN t.tbl <> 'orders'
       OR (SELECT attnotnull FROM pg_attribute
            WHERE attrelid='public.orders'::regclass
              AND attname='company_id' AND NOT attisdropped)
       THEN 'PASS' ELSE 'FAIL' END AS company_id_not_null
FROM t ORDER BY t.tbl;

\echo '── 2. SELECT em orders é tenant-scoped ─────────────────────────────'
SELECT
  policyname,
  cmd,
  CASE WHEN qual ILIKE '%get_user_company_id%'
       THEN 'PASS' ELSE 'FAIL' END AS tenant_scoped
FROM pg_policies
WHERE schemaname='public' AND tablename='orders' AND cmd='SELECT'
ORDER BY policyname;

\echo '── 3. Nenhuma policy SELECT aberta em orders ───────────────────────'
SELECT
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='orders' AND cmd='SELECT'
       AND qual IS NOT DISTINCT FROM 'true'
  ) THEN 'PASS' ELSE 'FAIL' END AS no_open_select_policy;

\echo '── 4. order_items possui policy de SELECT (join só via pedido) ─────'
SELECT
  policyname, cmd,
  CASE WHEN qual ILIKE '%orders%' OR qual ILIKE '%get_user_company_id%'
       THEN 'PASS' ELSE 'FAIL' END AS scoped_via_order_or_tenant
FROM pg_policies
WHERE schemaname='public' AND tablename='order_items' AND cmd IN ('SELECT','ALL')
ORDER BY policyname;

\echo '── 5. Dump completo das policies (inspeção visual) ─────────────────'
SELECT tablename, policyname, cmd,
       left(coalesce(qual,'-'),90)       AS using_,
       left(coalesce(with_check,'-'),90) AS with_check_
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('orders','order_items')
ORDER BY tablename, cmd, policyname;

-- PSQL ON_ERROR_STOP must fail on missing/open policies, not merely print FAIL.
DO $assert_order$
DECLARE v_table text; v_rel oid; v_failed text := '';
BEGIN
  FOREACH v_table IN ARRAY ARRAY['orders','order_items'] LOOP
    v_rel := to_regclass('public.' || v_table);
    IF v_rel IS NULL OR NOT COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = v_rel), false) OR
       (v_table = 'orders' AND NOT COALESCE((SELECT attnotnull FROM pg_attribute WHERE attrelid = v_rel AND attname = 'company_id' AND NOT attisdropped), false)) OR
       NOT EXISTS (
         SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = v_table AND cmd IN ('SELECT','ALL')
            AND (qual ILIKE '%get_user_company_id%' OR (v_table = 'order_items' AND qual ILIKE '%orders%'))
       ) OR
       EXISTS (
         SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = v_table AND cmd IN ('SELECT','ALL')
            AND (qual IS NULL OR lower(trim(qual)) IN ('true','(true)'))
       )
    THEN
      v_failed := v_failed || ' ' || v_table;
    END IF;
  END LOOP;
  IF v_failed <> '' THEN RAISE EXCEPTION 'RLS estático MCP get_order falhou:%', v_failed; END IF;
END $assert_order$;
