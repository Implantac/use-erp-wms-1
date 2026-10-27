-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- Conflito interno do histórico: 20260807000000 cria idempotency_keys no
-- desenho (idempotency_key, context, expires_at), enquanto 20260807122522
-- (F8) presume o desenho (idempotency_key, company_id, request_path,
-- response_code) — que é o do schema final da nuvem e o usado em tempo de
-- execução por supabase/functions/_shared/idempotency.ts (upsert com
-- onConflict "idempotency_key,company_id,request_path").
-- Como a F8 usa CREATE TABLE IF NOT EXISTS, em banco com a primeira versão
-- ela quebra nas policies (company_id inexistente). Convertemos a tabela
-- (vazia numa instalação nova) para o desenho final antes da F8 rodar.
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS request_path text;
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS response_code integer;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'idempotency_keys' AND column_name = 'context') THEN
    ALTER TABLE public.idempotency_keys ALTER COLUMN context DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'idempotency_keys' AND column_name = 'expires_at') THEN
    ALTER TABLE public.idempotency_keys ALTER COLUMN expires_at DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_local_upsert_key
  ON public.idempotency_keys (idempotency_key, company_id, request_path);
