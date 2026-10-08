-- Fail-closed legacy calculation: no zero-valued success without a rule, and
-- no cross-tenant rule selection. Requires per-client setup and exact match.
-- This does NOT homologate the legacy formulas or document layout.
CREATE OR REPLACE FUNCTION public.calculate_nfe_item_taxes(
  _ncm TEXT,
  _cfop TEXT,
  _quantity NUMERIC,
  _unit_price NUMERIC,
  _discount NUMERIC DEFAULT 0,
  _uf_origin TEXT DEFAULT NULL,
  _uf_destination TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule RECORD;
  v_company_id uuid;
  v_regime text;
  v_gross NUMERIC;
  v_base NUMERIC;
  v_icms_base NUMERIC;
  v_icms_value NUMERIC := 0;
  v_pis_value NUMERIC := 0;
  v_cofins_value NUMERIC := 0;
  v_ipi_value NUMERIC := 0;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Empresa fiscal não identificada'; END IF;
  SELECT tax_regime INTO v_regime FROM public.fiscal_client_setup WHERE company_id = v_company_id;
  IF v_regime IS NULL THEN RAISE EXCEPTION 'Configuração fiscal da empresa ausente'; END IF;
  IF _ncm IS NULL OR _cfop IS NULL OR _uf_origin IS NULL OR _uf_destination IS NULL
     OR _quantity IS NULL OR _quantity <= 0 OR _unit_price IS NULL OR _unit_price < 0
     OR _discount IS NULL OR _discount < 0 OR _discount > _quantity * _unit_price THEN
    RAISE EXCEPTION 'Contexto fiscal incompleto ou valores inválidos';
  END IF;
  v_gross := _quantity * _unit_price;
  v_base := GREATEST(v_gross - COALESCE(_discount,0), 0);

  SELECT * INTO v_rule
    FROM public.tax_rules
   WHERE company_id = v_company_id
     AND tax_regime = v_regime
     AND active = true
     AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
     AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     AND ncm = _ncm
     AND cfop = _cfop
     AND uf_origin = _uf_origin
     AND uf_destination = _uf_destination
   ORDER BY
     (CASE WHEN ncm = _ncm THEN 0 ELSE 1 END),
     (CASE WHEN cfop = _cfop THEN 0 ELSE 1 END),
     priority DESC
   LIMIT 1;

  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'Regra fiscal ausente para empresa, regime e operação';
  END IF;

  IF v_rule.icms_rate IS NULL OR v_rule.pis_rate IS NULL OR v_rule.cofins_rate IS NULL OR v_rule.ipi_rate IS NULL THEN
    RAISE EXCEPTION 'Alíquotas fiscais incompletas';
  END IF;
  v_icms_base := v_base * (1 - COALESCE(v_rule.icms_reduction_base,0)/100);
  v_icms_value := round(v_icms_base * v_rule.icms_rate / 100, 2);
  v_pis_value := round(v_base * v_rule.pis_rate / 100, 2);
  v_cofins_value := round(v_base * v_rule.cofins_rate / 100, 2);
  v_ipi_value := round(v_base * v_rule.ipi_rate / 100, 2);

  RETURN jsonb_build_object(
    'rule_id', v_rule.id,
    'rule_name', v_rule.name,
    'icms_cst', v_rule.icms_cst,
    'icms_base', round(v_icms_base,2),
    'icms_rate', v_rule.icms_rate,
    'icms_value', v_icms_value,
    'pis_cst', v_rule.pis_cst,
    'pis_rate', v_rule.pis_rate,
    'pis_value', v_pis_value,
    'cofins_cst', v_rule.cofins_cst,
    'cofins_rate', v_rule.cofins_rate,
    'cofins_value', v_cofins_value,
    'ipi_cst', v_rule.ipi_cst,
    'ipi_rate', v_rule.ipi_rate,
    'ipi_value', v_ipi_value,
    'total', round(v_base + v_ipi_value, 2)
  );
END;
$$;

-- The first trigger calls the legacy RPC without UF, and the second previously
-- swallowed EVERY calculation error and saved zero-valued items. Keep one
-- fail-closed trigger; a missing rule aborts the item write, never returns zero.
DROP TRIGGER IF EXISTS trg_nfe_items_auto_calc ON public.nfe_items;
CREATE OR REPLACE FUNCTION public.recalc_nfe_item_taxes_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base numeric;
  nfe_row record;
  st_result jsonb;
  difal_result jsonb;
  base_calc jsonb;
BEGIN
  SELECT * INTO nfe_row FROM public.nfe WHERE id = NEW.nfe_id;
  IF nfe_row.id IS NULL OR nfe_row.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
    RAISE EXCEPTION 'NF-e não pertence à empresa fiscal ativa';
  END IF;
  base := (NEW.quantity * NEW.unit_price) - COALESCE(NEW.discount, 0);

  -- Cálculo base via função existente (ICMS, PIS, COFINS, IPI)
  base_calc := public.calculate_nfe_item_taxes(
      _ncm := NEW.ncm,
      _cfop := NEW.cfop,
      _quantity := NEW.quantity,
      _unit_price := NEW.unit_price,
      _discount := COALESCE(NEW.discount, 0),
      _uf_origin := nfe_row.uf_origin,
      _uf_destination := nfe_row.uf_destination
    )::jsonb;
    NEW.icms_base := COALESCE((base_calc->>'icms_base')::numeric, base);
    NEW.icms_rate := COALESCE((base_calc->>'icms_rate')::numeric, NEW.icms_rate);
    NEW.icms_value := COALESCE((base_calc->>'icms_value')::numeric, NEW.icms_value);
    NEW.pis_rate := COALESCE((base_calc->>'pis_rate')::numeric, NEW.pis_rate);
    NEW.pis_value := COALESCE((base_calc->>'pis_value')::numeric, NEW.pis_value);
    NEW.cofins_rate := COALESCE((base_calc->>'cofins_rate')::numeric, NEW.cofins_rate);
    NEW.cofins_value := COALESCE((base_calc->>'cofins_value')::numeric, NEW.cofins_value);
    NEW.ipi_rate := COALESCE((base_calc->>'ipi_rate')::numeric, NEW.ipi_rate);
    NEW.ipi_value := COALESCE((base_calc->>'ipi_value')::numeric, NEW.ipi_value);

  -- ICMS ST
  IF nfe_row.uf_origin IS NOT NULL AND nfe_row.uf_destination IS NOT NULL THEN
    st_result := public.calculate_icms_st(NEW.ncm, nfe_row.uf_origin, nfe_row.uf_destination, base, NEW.icms_value);
    NEW.icms_st_base := COALESCE((st_result->>'st_base')::numeric, 0);
    NEW.icms_st_value := COALESCE((st_result->>'st_value')::numeric, 0);
    NEW.icms_st_mva := COALESCE((st_result->>'mva')::numeric, 0);

    -- DIFAL apenas para consumidor final interestadual
    IF nfe_row.consumer_final = true AND nfe_row.uf_origin <> nfe_row.uf_destination THEN
      difal_result := public.calculate_difal(nfe_row.uf_origin, nfe_row.uf_destination, base);
      NEW.difal_base := base;
      NEW.difal_value := COALESCE((difal_result->>'difal_value')::numeric, 0);
      NEW.difal_destination_rate := COALESCE((difal_result->>'destination_rate')::numeric, 0);
      NEW.fcp_value := COALESCE((difal_result->>'fcp_value')::numeric, 0);
    END IF;
  END IF;

  NEW.total := base + COALESCE(NEW.ipi_value, 0) + COALESCE(NEW.icms_st_value, 0);
  RETURN NEW;
END;
$$;
