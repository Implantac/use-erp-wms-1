-- ============================================================================
-- Carga validada da máquina de tingir (T83/P1, do manual PCP têxtil §8.6)
--
-- O cadastro de equipamentos ganha os limites que a empresa validar para a
-- máquina (carga mínima/máxima da partida e volume útil do banho). Quando
-- configurados, o banco rejeita partida de tinturaria fora da carga ou com
-- volume de banho (peso × relação de banho) acima do volume útil. Limite
-- não configurado = sem validação: nada é presumido.
-- ============================================================================

ALTER TABLE public.production_machines
  ADD COLUMN IF NOT EXISTS min_load_kg numeric,
  ADD COLUMN IF NOT EXISTS max_load_kg numeric,
  ADD COLUMN IF NOT EXISTS useful_bath_volume_l numeric;

ALTER TABLE public.production_machines
  DROP CONSTRAINT IF EXISTS production_machines_load_limits_check;
ALTER TABLE public.production_machines
  ADD CONSTRAINT production_machines_load_limits_check CHECK (
    (min_load_kg IS NULL OR min_load_kg >= 0)
    AND (max_load_kg IS NULL OR max_load_kg >= 0)
    AND (useful_bath_volume_l IS NULL OR useful_bath_volume_l >= 0)
    AND (min_load_kg IS NULL OR max_load_kg IS NULL OR min_load_kg <= max_load_kg)
  );

CREATE OR REPLACE FUNCTION public.validate_dyeing_machine_load()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_machine public.production_machines%ROWTYPE;
  v_bath_volume numeric;
BEGIN
  IF NEW.machine_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_machine FROM public.production_machines WHERE id = NEW.machine_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.planned_output_kg IS NOT NULL THEN
    IF v_machine.min_load_kg IS NOT NULL AND NEW.planned_output_kg < v_machine.min_load_kg THEN
      RAISE EXCEPTION 'Partida de % kg está abaixo da carga mínima configurada da máquina % (min % kg)',
        NEW.planned_output_kg, v_machine.code, v_machine.min_load_kg USING ERRCODE = '22023';
    END IF;
    IF v_machine.max_load_kg IS NOT NULL AND NEW.planned_output_kg > v_machine.max_load_kg THEN
      RAISE EXCEPTION 'Partida de % kg excede a carga máxima configurada da máquina % (max % kg)',
        NEW.planned_output_kg, v_machine.code, v_machine.max_load_kg USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_machine.useful_bath_volume_l IS NOT NULL
     AND NEW.planned_output_kg IS NOT NULL AND NEW.bath_ratio IS NOT NULL THEN
    v_bath_volume := NEW.planned_output_kg * NEW.bath_ratio;
    IF v_bath_volume > v_machine.useful_bath_volume_l THEN
      RAISE EXCEPTION 'Volume do banho de % L (peso × relação de banho) excede o volume útil configurado da máquina % (% L)',
        v_bath_volume, v_machine.code, v_machine.useful_bath_volume_l USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_dyeing_machine_load ON public.dyeing_order_profiles;
CREATE TRIGGER trg_validate_dyeing_machine_load
  BEFORE INSERT OR UPDATE OF machine_id, planned_output_kg, bath_ratio
  ON public.dyeing_order_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_dyeing_machine_load();

COMMENT ON COLUMN public.production_machines.min_load_kg IS
  'Carga mínima validada da partida (kg), quando a empresa configurar; nunca presumida.';
COMMENT ON COLUMN public.production_machines.max_load_kg IS
  'Carga máxima validada da partida (kg), quando a empresa configurar; nunca presumida.';
COMMENT ON COLUMN public.production_machines.useful_bath_volume_l IS
  'Volume útil do banho (L) validado pela empresa, quando aplicável.';
