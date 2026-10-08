-- Fail closed until the storefront checkout has a verified payment provider.
-- Existing orders remain readable. Service-role integrations can still create
-- orders and change payment status once a trusted, idempotent webhook exists.
CREATE OR REPLACE FUNCTION public.guard_unverified_storefront_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Public storefront checkout unavailable: payment provider not configured'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Payment status can only be confirmed by a trusted payment integration'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.order_status IN ('confirmed', 'preparing', 'shipped', 'delivered')
     AND OLD.order_status IS DISTINCT FROM NEW.order_status
     AND OLD.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Unpaid storefront order cannot advance'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_unverified_storefront_checkout ON public.storefront_orders;
CREATE TRIGGER guard_unverified_storefront_checkout
BEFORE INSERT OR UPDATE ON public.storefront_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_unverified_storefront_checkout();
