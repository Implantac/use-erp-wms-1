ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS canal_operacional public.canal_operacional;
COMMENT ON COLUMN public.profiles.canal_operacional IS 'Canal fixo do usuário; nulo = todos os canais da empresa/unidade.';

CREATE OR REPLACE FUNCTION public.in_user_channel_scope(_canal public.canal_operacional)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _canal IS NULL
      OR public.is_matriz_viewer(auth.uid())
      OR COALESCE((SELECT p.canal_operacional FROM public.profiles p WHERE p.id = auth.uid()), _canal) = _canal
$$;
REVOKE ALL ON FUNCTION public.in_user_channel_scope(public.canal_operacional) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_user_channel_scope(public.canal_operacional) TO authenticated, service_role;

DO $$
DECLARE t text; typ text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts_payable','accounts_receivable','cash_flow_entries','financial_ledger','nfe','nfce',
    'orders','stock_balances','stock_movements','wms_receiving_orders']
  LOOP
    SELECT udt_name INTO typ FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='canal_operacional';
    EXECUTE format('DROP POLICY IF EXISTS channel_scope ON public.%I', t);
    IF typ = 'canal_operacional' THEN
      EXECUTE format('CREATE POLICY channel_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.in_user_channel_scope(canal_operacional)) WITH CHECK (public.in_user_channel_scope(canal_operacional))', t);
    ELSE
      EXECUTE format('CREATE POLICY channel_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.in_user_channel_scope(canal_operacional::text::public.canal_operacional)) WITH CHECK (public.in_user_channel_scope(canal_operacional::text::public.canal_operacional))', t);
    END IF;
  END LOOP;
END $$;