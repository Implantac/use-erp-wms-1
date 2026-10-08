-- New customers must begin WITHOUT estimated ICMS/PIS/COFINS/IPI rates.
-- The old trigger inserted seven fiscal rules with hardcoded percentages into
-- every new company (including companies created by bootstrap_tenant).
DROP TRIGGER IF EXISTS trg_setup_fiscal_on_company_creation ON public.companies;
DROP FUNCTION IF EXISTS public.fn_setup_new_company_fiscal();

-- Historical company/rule data is deliberately NOT deleted: some deployments
-- may already have documents, accounting references or user-edited rules.
-- Audit legacy generated rows before disabling/removing them on a real tenant.
-- Fiscal setup remains unapproved until reviewed per company and operation.

-- Reject fabricated addresses even when onboarding is called directly via RPC.
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
  _company_name text,
  _cnpj text,
  _segment text,
  _address_street text,
  _address_number text,
  _address_neighborhood text,
  _address_city text,
  _address_state text,
  _address_zip text,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _existing uuid;
  _company_id uuid;
  _branch_id uuid;
  _plan_id uuid;
  _sub_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Block users that already belong to a tenant
  SELECT company_id INTO _existing FROM public.profiles WHERE id = _user_id;
  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'user_already_in_tenant';
  END IF;

  IF coalesce(trim(_company_name), '') = '' OR coalesce(trim(_segment), '') = '' OR
     length(regexp_replace(coalesce(_cnpj, ''), '[^0-9]', '', 'g')) <> 14 OR
     coalesce(trim(_address_street), '') = '' OR coalesce(trim(_address_number), '') = '' OR
     coalesce(trim(_address_neighborhood), '') = '' OR coalesce(trim(_address_city), '') = '' OR
     coalesce(trim(_address_state), '') !~ '^[A-Z]{2}$' OR
     coalesce(trim(_address_zip), '') !~ '^[0-9]{5}-?[0-9]{3}$' THEN
    RAISE EXCEPTION 'missing_or_invalid_required_company_fields';
  END IF;

  -- Create company (headquarters)
  INSERT INTO public.companies (
    name, trade_name, cnpj, segment, status,
    address_street, address_number, address_neighborhood,
    address_city, address_state, address_zip_code,
    is_headquarters, phone, email
  ) VALUES (
    _company_name, _company_name, _cnpj, _segment, 'active',
    trim(_address_street), trim(_address_number),
    trim(_address_neighborhood),
    trim(_address_city), trim(_address_state),
    trim(_address_zip),
    true, _phone, _email
  )
  RETURNING id INTO _company_id;

  -- Create matrix branch
  INSERT INTO public.branches (
    company_id, name, code, is_headquarters, is_active,
    address_street, address_number, address_neighborhood,
    address_city, address_state, address_zip_code
  ) VALUES (
    _company_id, 'Matriz', 'MATRIZ', true, true,
    trim(_address_street), trim(_address_number),
    trim(_address_neighborhood),
    trim(_address_city), trim(_address_state),
    trim(_address_zip)
  )
  RETURNING id INTO _branch_id;

  -- Link profile
  UPDATE public.profiles
    SET company_id = _company_id,
        branch_id = _branch_id,
        default_branch_id = _branch_id,
        updated_at = now()
  WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_user_id, 'admin', _company_id)
  ON CONFLICT DO NOTHING;

  -- Activate Starter plan in 14-day trial
  SELECT id INTO _plan_id FROM public.plans WHERE slug = 'starter' AND is_active = true LIMIT 1;
  IF _plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      company_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end, trial_end
    ) VALUES (
      _company_id, _plan_id, 'trialing', 'monthly',
      now(), now() + interval '14 days', now() + interval '14 days'
    )
    RETURNING id INTO _sub_id;
  END IF;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'branch_id', _branch_id,
    'subscription_id', _sub_id,
    'trial_ends_at', now() + interval '14 days'
  );
END;
$$;
