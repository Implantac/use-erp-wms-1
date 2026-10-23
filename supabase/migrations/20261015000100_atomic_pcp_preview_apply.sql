-- Atomic application of versioned PCP priority and schedule plans.
-- Only the authenticated service-role edge functions may call this RPC.
-- Do not apply in production before isolated migration/RBAC/concurrency tests.
CREATE OR REPLACE FUNCTION public.apply_pcp_preview(
  p_company_id uuid,
  p_kind text,
  p_updates jsonb,
  p_branch_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  item jsonb;
  v_id uuid;
  v_version timestamptz;
  v_priority text;
  v_score numeric;
  v_sequence integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
  v_affected integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('priority', 'schedule')
     OR jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid PCP plan';
  END IF;
  -- [Correcao instalacao local] CASE entre parenteses: sem eles o parser do
  -- PL/pgSQL encerra a expressao no CASE ("syntax error at end of input") e a
  -- funcao nao pode ser criada em nenhum Postgres. Semantica inalterada.
  IF jsonb_array_length(p_updates) > (CASE WHEN p_kind = 'schedule' THEN 100 ELSE 500 END)
     OR (p_branch_ids IS NOT NULL AND cardinality(p_branch_ids) = 0) THEN
    RAISE EXCEPTION 'PCP plan exceeds verified scope';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR NOT (item ? 'id' AND item ? 'updated_at') THEN
      RAISE EXCEPTION 'invalid PCP plan entry';
    END IF;
    v_id := (item->>'id')::uuid;
    v_version := (item->>'updated_at')::timestamptz;
    IF v_id IS NULL OR v_version IS NULL OR v_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'missing or duplicated PCP plan version';
    END IF;
    v_seen := array_append(v_seen, v_id);
    v_count := v_count + 1;

    IF p_kind = 'priority' THEN
      v_priority := item->>'priority';
      v_score := (item->>'priority_score')::numeric;
      IF v_score IS NULL OR v_priority NOT IN ('urgent', 'high', 'medium', 'low') OR v_priority IS NULL THEN
        RAISE EXCEPTION 'invalid priority plan entry';
      END IF;
      UPDATE public.production_orders
      SET priority_score = v_score, priority = v_priority, updated_at = clock_timestamp()
      WHERE id = v_id AND company_id = p_company_id AND updated_at = v_version
        AND status IN ('planned', 'in_progress', 'paused', 'waiting_material', 'outsourced')
        AND (p_branch_ids IS NULL OR branch_id = ANY(p_branch_ids));
    ELSE
      v_sequence := (item->>'sequence_order')::integer;
      IF v_sequence IS NULL OR v_sequence <> v_count THEN
        RAISE EXCEPTION 'invalid order in schedule plan';
      END IF;
      UPDATE public.production_orders
      SET sequence_order = v_sequence, updated_at = clock_timestamp()
      WHERE id = v_id AND company_id = p_company_id AND updated_at = v_version
        AND status IN ('planned', 'in_progress', 'paused', 'waiting_material', 'outsourced')
        AND (p_branch_ids IS NULL OR branch_id = ANY(p_branch_ids));
    END IF;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'PCP plan changed; transaction rolled back' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pcp_preview(uuid, text, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_pcp_preview(uuid, text, jsonb, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pcp_preview(uuid, text, jsonb, uuid[]) TO service_role;
