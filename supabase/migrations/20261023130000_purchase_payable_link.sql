-- ============================================================================
-- Compras -> Financeiro: o recebimento do pedido gera o título a pagar
--
-- Pedido de compra que vira 'received'/'partially_received' gera (ou
-- atualiza) UM título em accounts_payable, com origem rastreável
-- (source_type='purchase_order', source_id=pedido). Valor = soma do que
-- foi efetivamente recebido (received_quantity x unit_price); se o status
-- é 'received' sem detalhe de itens, assume o total do pedido. Reenvios
-- atualizam o mesmo título (nunca duplicam). É a conversa Compras->
-- Financeiro acontecendo no banco, valha a tela que for.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_payable_for_purchase_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_received numeric;
  v_total_qty numeric;
  v_received_qty numeric;
  v_value numeric;
  v_existing uuid;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Chamadas diretas via RPC exigem vínculo com a empresa; o trigger
  -- (contexto interno) sinaliza com a GUC abaixo e não é barrado.
  IF COALESCE(current_setting('app.purchase_payable_link', true), '') <> 'on'
     AND auth.uid() IS NOT NULL AND NOT (
    public.is_system_admin(auth.uid())
    OR v_po.company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = v_po.company_id)
  ) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(received_quantity * unit_price), 0),
         COALESCE(sum(quantity), 0),
         COALESCE(sum(received_quantity), 0)
    INTO v_received, v_total_qty, v_received_qty
    FROM public.purchase_order_items
   WHERE purchase_order_id = p_order_id;

  v_value := v_received;
  IF v_value = 0 AND v_po.status = 'received' THEN
    v_value := COALESCE(v_po.total, 0);
  END IF;
  IF v_value <= 0 THEN RETURN NULL; END IF;

  SELECT id INTO v_existing
    FROM public.accounts_payable
   WHERE source_type = 'purchase_order' AND source_id = p_order_id
     AND status <> 'cancelled'
   ORDER BY created_at LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.accounts_payable
       SET amount = v_value,
           original_amount = v_value,
           open_amount = GREATEST(v_value - COALESCE(paid_amount, 0), 0),
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
GRANT EXECUTE ON FUNCTION public.generate_payable_for_purchase_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_purchase_order_payable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.purchase_payable_link', 'on', true);
  IF NEW.status IN ('received', 'partially_received')
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR EXISTS (SELECT 1 FROM public.purchase_order_items i
                      WHERE i.purchase_order_id = NEW.id AND i.received_quantity > 0)) THEN
    PERFORM public.generate_payable_for_purchase_order(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purchase_order_payable_link ON public.purchase_orders;
CREATE TRIGGER purchase_order_payable_link
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_order_payable();
