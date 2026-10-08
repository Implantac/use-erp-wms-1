-- The previous SECURITY DEFINER function accepted any notification UUID after
-- checking a global admin role. Enforce the caller's current company on both
-- notification and assignee. Missing or cross-tenant IDs fail closed.
CREATE OR REPLACE FUNCTION public.assign_notification(
  _notification_id uuid,
  _assigned_to uuid,
  _due_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.get_user_company_id(auth.uid());
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa autenticada não identificada';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role, v_company)
    OR public.has_role(auth.uid(), 'admin_matriz'::app_role, v_company)
  ) THEN
    RAISE EXCEPTION 'Somente administradores da empresa podem atribuir alertas';
  END IF;
  IF _notification_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE id = _notification_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Alerta não encontrado na empresa ativa';
  END IF;
  IF _assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _assigned_to AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Responsável não pertence à empresa ativa';
  END IF;

  UPDATE public.notifications
     SET assigned_to = _assigned_to, due_at = _due_at
   WHERE id = _notification_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta não encontrado na empresa ativa'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_notification(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_notification(uuid, uuid, timestamptz) TO authenticated;
