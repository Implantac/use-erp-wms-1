-- Correção da deduplicação de alertas: a chave passa a ser (origem + título),
-- não (origem + categoria). Antes, o alerta "mercadoria em trânsito" (mesma
-- categoria 'receiving') impedia o alerta CRÍTICO de divergência do mesmo
-- pedido nascer. Cada tipo de pendência tem seu próprio título.
CREATE OR REPLACE FUNCTION public.fn_alert_new_task(
  p_company uuid, p_branch uuid, p_category text, p_priority text,
  p_title text, p_description text, p_origin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_company IS NULL OR p_branch IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_tasks
    WHERE origin_id = p_origin_id AND title = p_title AND status = 'pending'
  ) THEN RETURN; END IF;
  INSERT INTO public.operational_tasks (
    company_id, branch_id, title, description, priority, status,
    category, origin_type, origin_id
  ) VALUES (
    p_company, p_branch, p_title, p_description, p_priority, 'pending',
    p_category, 'stock_transfer', p_origin_id
  );
END;
$$;
