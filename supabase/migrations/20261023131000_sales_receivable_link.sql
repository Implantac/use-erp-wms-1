-- ============================================================================
-- Vendas -> Financeiro + consolidação das regras legadas
--
-- 1) COMPRAS: aposenta o trigger legado (gerava título pelo total na
--    APROVAÇÃO, sem origem) — vale a regra do recebimento (migration
--    20261023130000). Títulos legados já gerados são ADOTADOS pela regra
--    nova (mesma linha ganha origem e valor recalculado), sem duplicar.
-- 2) VENDAS (sales/PDV): corrige generate_receivable_from_sale — a versão
--    de 2026-07-01 havia PERDIDO a deduplicação (cada update em completed
--    criava outro título). Agora: só na transição p/ completed, um título
--    por venda, com origem (order_id + source).
-- 3) PEDIDOS COMERCIAIS (orders): ao virar 'invoiced' (faturado no ciclo
--    de vida), gera o título a receber uma única vez, com origem.
-- ============================================================================

-- 1) Compras: aposenta o legado e ensina a regra nova a adotar o título
DROP TRIGGER IF EXISTS trigger_purchase_payable ON public.purchase_orders;
DROP FUNCTION IF EXISTS public.generate_payable_from_purchase();

CREATE OR REPLACE FUNCTION public.generate_payable_for_purchase_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_received numeric;
  v_value numeric;
  v_existing uuid;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF COALESCE(current_setting('app.purchase_payable_link', true), '') <> 'on'
     AND auth.uid() IS NOT NULL AND NOT (
    public.is_system_admin(auth.uid())
    OR v_po.company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = v_po.company_id)
  ) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(received_quantity * unit_price), 0)
    INTO v_received
    FROM public.purchase_order_items
   WHERE purchase_order_id = p_order_id;

  v_value := v_received;
  IF v_value = 0 AND v_po.status = 'received' THEN
    v_value := COALESCE(v_po.total, 0);
  END IF;
  IF v_value <= 0 THEN RETURN NULL; END IF;

  SELECT id INTO v_existing
    FROM public.accounts_payable
   WHERE source_id = p_order_id AND status <> 'cancelled'
   ORDER BY created_at LIMIT 1;

  IF v_existing IS NULL AND v_po.number IS NOT NULL THEN
    -- Adoção do título legado (gerado na aprovação, sem origem)
    SELECT id INTO v_existing
      FROM public.accounts_payable
     WHERE invoice_number = v_po.number
       AND source_type IS NULL
       AND status <> 'cancelled'
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.accounts_payable
       SET amount = v_value,
           original_amount = v_value,
           open_amount = GREATEST(v_value - COALESCE(paid_amount, 0), 0),
           source_type = 'purchase_order',
           source_id = p_order_id,
           updated_at = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.accounts_payable (
    company_id, supplier, description, category, amount, original_amount,
    open_amount, paid_amount, due_date, status, invoice_number,
    source_type, source_id
  ) VALUES (
    v_po.company_id,
    COALESCE(NULLIF(v_po.supplier_name, ''), 'Fornecedor'),
    'Pedido de compra ' || COALESCE(v_po.number, ''),
    'Compras',
    v_value, v_value, v_value, 0,
    COALESCE(v_po.expected_delivery, v_po.date, CURRENT_DATE),
    'pending',
    v_po.number,
    'purchase_order',
    p_order_id
  )
  RETURNING id INTO v_existing;
  RETURN v_existing;
END $$;

-- 2) Vendas (sales): dedupe restaurada + origem
CREATE OR REPLACE FUNCTION public.generate_receivable_from_sale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    IF EXISTS (
      SELECT 1 FROM public.accounts_receivable
       WHERE order_id = NEW.id AND status <> 'cancelled'
    ) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.accounts_receivable (
      description, client_name, client_id, amount, due_date,
      status, category, invoice_number, order_id, notes, company_id,
      source_type, source_id, original_amount, open_amount
    ) VALUES (
      'Venda ' || NEW.number, NEW.client_name, NEW.client_id, NEW.total,
      (now() + interval '30 days'), 'pending', 'Vendas',
      NEW.number, NEW.id, 'Gerado automaticamente da venda ' || NEW.number,
      NEW.company_id, 'sale', NEW.id, NEW.total, NEW.total
    );
  END IF;
  RETURN NEW;
END $$;

-- 3) Pedidos comerciais: faturado -> título a receber (uma vez)
CREATE OR REPLACE FUNCTION public.generate_receivable_for_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF COALESCE(current_setting('app.sales_receivable_link', true), '') <> 'on'
     AND auth.uid() IS NOT NULL AND NOT (
    public.is_system_admin(auth.uid())
    OR v_order.company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = v_order.company_id)
  ) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing
    FROM public.accounts_receivable
   WHERE order_id = p_order_id AND status <> 'cancelled'
   ORDER BY created_at LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.accounts_receivable (
    description, client_name, client_id, amount, due_date,
    status, category, invoice_number, order_id, notes, company_id,
    source_type, source_id, original_amount, open_amount, issue_date
  ) VALUES (
    'Pedido ' || COALESCE(v_order.number, ''),
    v_order.client_name, v_order.client_id, COALESCE(v_order.total, 0),
    COALESCE(v_order.expected_billing_date::date, CURRENT_DATE + 30),
    'pending', 'Vendas', v_order.number, p_order_id,
    'Gerado automaticamente do pedido faturado ' || COALESCE(v_order.number, ''),
    v_order.company_id, 'order', p_order_id,
    COALESCE(v_order.total, 0), COALESCE(v_order.total, 0), CURRENT_DATE
  )
  RETURNING id INTO v_existing;
  RETURN v_existing;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_receivable_for_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_order_receivable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.sales_receivable_link', 'on', true);
  IF NEW.status = 'invoiced' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.generate_receivable_for_order(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_receivable_link ON public.orders;
CREATE TRIGGER order_receivable_link
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_receivable();
