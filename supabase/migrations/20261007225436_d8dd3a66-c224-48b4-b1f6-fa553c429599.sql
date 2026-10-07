CREATE TABLE public.purchase_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.get_user_company_id(auth.uid()),
  number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','answered','approved','rejected','cancelled')),
  due_date date,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE TABLE public.purchase_quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.purchase_quotations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT public.get_user_company_id(auth.uid()),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchase_quotations(company_id, created_at DESC);
CREATE INDEX ON public.purchase_quotation_items(quotation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_quotations, public.purchase_quotation_items TO authenticated;
GRANT ALL ON public.purchase_quotations, public.purchase_quotation_items TO service_role;
ALTER TABLE public.purchase_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pq_select ON public.purchase_quotations FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY pq_insert ON public.purchase_quotations FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY pq_update ON public.purchase_quotations FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid())) WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY pq_delete ON public.purchase_quotations FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) AND status IN ('draft','cancelled') AND (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)));

CREATE POLICY pqi_all ON public.purchase_quotation_items FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND EXISTS (SELECT 1 FROM public.purchase_quotations q WHERE q.id = quotation_id AND q.company_id = purchase_quotation_items.company_id AND q.status IN ('draft','sent','answered')));

CREATE OR REPLACE FUNCTION public.touch_purchase_quotation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); NEW.company_id := OLD.company_id; RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_purchase_quotation BEFORE UPDATE ON public.purchase_quotations FOR EACH ROW EXECUTE FUNCTION public.touch_purchase_quotation();