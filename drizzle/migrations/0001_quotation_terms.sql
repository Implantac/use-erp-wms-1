ALTER TABLE public.purchase_quotations ADD COLUMN IF NOT EXISTS delivery_days integer CHECK (delivery_days IS NULL OR delivery_days >= 0),
  ADD COLUMN IF NOT EXISTS payment_condition text;

CREATE OR REPLACE FUNCTION public.convert_quotation_to_purchase_order(_quotation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; _po uuid; _sub numeric; _sname text;
BEGIN
  SELECT * INTO q FROM public.purchase_quotations WHERE id = _quotation_id FOR UPDATE;
  IF q.id IS NULL OR q.company_id <> public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Cotação não encontrada.'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin', q.company_id) OR public.has_role(auth.uid(), 'manager', q.company_id)) THEN
    RAISE EXCEPTION 'Somente gestores e administradores geram pedidos de compra.'; END IF;
  IF q.purchase_order_id IS NOT NULL THEN RETURN q.purchase_order_id; END IF;
  IF q.status <> 'approved' THEN RAISE EXCEPTION 'Apenas cotações aprovadas viram pedido.'; END IF;
  IF q.supplier_id IS NULL THEN RAISE EXCEPTION 'Defina o fornecedor antes de gerar o pedido.'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_quotation_items WHERE quotation_id = q.id AND unit_price IS NULL) THEN
    RAISE EXCEPTION 'Todos os itens precisam de preço.'; END IF;
  SELECT name INTO _sname FROM public.suppliers WHERE id = q.supplier_id;
  SELECT coalesce(sum(quantity * unit_price), 0) INTO _sub FROM public.purchase_quotation_items WHERE quotation_id = q.id;
  IF _sub <= 0 THEN RAISE EXCEPTION 'A cotação não tem itens.'; END IF;

  INSERT INTO public.purchase_orders (company_id, number, supplier_id, supplier_name, status, subtotal, total, notes, buyer_id, payment_condition, expected_delivery)
  VALUES (q.company_id, 'PC-' || q.number, q.supplier_id, coalesce(_sname, 'Fornecedor'), 'pending', _sub, _sub,
          'Gerado da cotação ' || q.number, auth.uid(), q.payment_condition,
          CASE WHEN q.delivery_days IS NULL THEN NULL ELSE (current_date + q.delivery_days)::timestamptz END)
  RETURNING id INTO _po;

  INSERT INTO public.purchase_order_items (company_id, purchase_order_id, product_id, product_code, product_name, quantity, unit_price, total, unit)
  SELECT q.company_id, _po, i.product_id, coalesce(p.code, '-'), i.description, i.quantity, i.unit_price, i.quantity * i.unit_price, coalesce(p.unit, 'UN')
  FROM public.purchase_quotation_items i LEFT JOIN public.products p ON p.id = i.product_id WHERE i.quotation_id = q.id;

  UPDATE public.purchase_quotations SET purchase_order_id = _po, updated_at = now() WHERE id = q.id;
  RETURN _po;
END $$;
REVOKE ALL ON FUNCTION public.convert_quotation_to_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_purchase_order(uuid) TO authenticated;