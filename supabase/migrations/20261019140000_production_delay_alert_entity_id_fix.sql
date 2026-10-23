-- ============================================================================
-- Correção: trigger de alerta de atraso quebrava UPDATE de OP (uuid = text)
--
-- Evidência (harness scripts/live-manager-journey.mjs, 2026-10-19):
--   industrial_alerts.entity_id é UUID (20260411003252), mas a função
--   check_production_delay_alert() (20260413111143) compara
--   `entity_id = NEW.id::text`. Não existe operador uuid = text, então:
--     - TODA conclusão de OP (NEW.status='completed') falhava no ramo de
--       auto-resolução do alerta — inclusive via complete_production_order;
--     - qualquer UPDATE de OP atrasada (due_date < hoje, não concluída)
--       falharia no ramo de geração do alerta.
--
-- Correção mínima: recria a função idêntica usando NEW.id (uuid) nas
-- comparações e na inserção. Comportamento preservado: gera alerta 'delay'
-- para OP vencida e resolve alertas ativos quando a OP conclui.
-- Reversão: restaurar o corpo de 20260413111143 (NÃO recomendada: reintroduz
-- o erro de tipo que bloqueia a conclusão de OPs).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_production_delay_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- When an OP is updated and still not completed, check if overdue
  IF NEW.status NOT IN ('completed', 'cancelled') AND NEW.due_date IS NOT NULL THEN
    IF NEW.due_date::date < CURRENT_DATE THEN
      -- Check if alert already exists for this OP
      IF NOT EXISTS (
        SELECT 1 FROM public.industrial_alerts
        WHERE entity_id = NEW.id AND alert_type = 'delay' AND status = 'active'
      ) THEN
        INSERT INTO public.industrial_alerts (
          alert_type, severity, title, description,
          entity_type, entity_id, entity_name, status
        ) VALUES (
          'delay',
          CASE
            WHEN (CURRENT_DATE - NEW.due_date::date) > 7 THEN 'critical'
            WHEN (CURRENT_DATE - NEW.due_date::date) > 3 THEN 'high'
            ELSE 'medium'
          END,
          'OP ' || NEW.order_number || ' atrasada',
          'Produto: ' || NEW.product_name || ' — Atraso de ' || (CURRENT_DATE - NEW.due_date::date) || ' dias',
          'production_order', NEW.id, NEW.order_number, 'active'
        );
      END IF;
    END IF;
  END IF;

  -- Auto-resolve alert when OP is completed
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.industrial_alerts
    SET status = 'resolved', resolved_at = now()
    WHERE entity_id = NEW.id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$function$;
