-- ============================================================================
-- Caixa de entrada da Fábrica (leitura única e autorizada no servidor)
--
-- A indústria precisa enxergar TODA solicitação das lojas num lugar só,
-- sem depender de contexto de empresa nem de RLS de tabela:
--   * supply_requests PENDENTES das empresas do grupo (analisar origem);
--   * intercompany_replenishment_requests PENDENTES (decidir na indústria).
-- Só gestor da indústria (admin/manager na empresa-raiz) ou system_admin.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.factory_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  v_root := public.company_group_root(v_company);
  IF NOT (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = v_root
        AND ur.role IN ('admin', 'manager')
    )
  ) THEN
    RAISE EXCEPTION 'Caixa de entrada restrita aos gestores da indústria'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'group_root_company_id', v_root,
    'supply', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.created_at DESC)
      FROM (
        SELECT
          sr.id, sr.company_id, c.name AS company_name,
          sr.requester_branch_id, b.name AS branch_name,
          sr.product_id, sr.product_code, sr.product_name,
          sr.quantity, sr.status, sr.created_at
        FROM public.supply_requests sr
        JOIN public.companies c ON c.id = sr.company_id
        LEFT JOIN public.branches b ON b.id = sr.requester_branch_id
        WHERE sr.status = 'PENDENTE'
          AND (sr.company_id = v_root OR c.parent_company_id = v_root)
        ORDER BY sr.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'intercompany', COALESCE((
      SELECT jsonb_agg(y ORDER BY y.created_at DESC)
      FROM (
        SELECT
          ir.id, ir.requesting_company_id, c.name AS company_name,
          ir.requesting_branch_id, b.name AS branch_name,
          ir.product_code, ir.product_name, ir.quantity, ir.status, ir.created_at
        FROM public.intercompany_replenishment_requests ir
        JOIN public.companies c ON c.id = ir.requesting_company_id
        LEFT JOIN public.branches b ON b.id = ir.requesting_branch_id
        WHERE ir.group_root_company_id = v_root
          AND ir.status = 'pendente'
        ORDER BY ir.created_at DESC
        LIMIT 50
      ) y
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.factory_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factory_inbox() TO authenticated, service_role;
