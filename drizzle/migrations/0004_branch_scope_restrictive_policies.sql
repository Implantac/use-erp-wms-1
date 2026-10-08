CREATE OR REPLACE FUNCTION public.in_user_branch_scope(_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _branch_id IS NULL
      OR public.is_matriz_viewer(auth.uid())
      OR COALESCE((SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid()), _branch_id) = _branch_id
$$;
REVOKE ALL ON FUNCTION public.in_user_branch_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_user_branch_scope(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts_payable','accounts_receivable','cash_flow_entries','financial_ledger','nfe','nfce','nfce_returns',
    'orders','production_orders','stock_balances','stock_movements','pos_sessions','pos_terminals','replenishment_tasks',
    'replenishment_policies','wms_receiving_orders','operational_tasks','operational_discrepancies','fiscal_documents','oee_metrics']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS branch_scope ON public.%I', t);
    EXECUTE format('CREATE POLICY branch_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.in_user_branch_scope(branch_id)) WITH CHECK (public.in_user_branch_scope(branch_id))', t);
  END LOOP;
END $$;