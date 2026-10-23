-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260807120000 (RBAC F7) presume uma tabela permissions com
-- coluna "name" UNIQUE — mas quem cria public.permissions é a migration
-- 20260625164317, com o desenho (resource, action, module_key) e UNIQUE
-- (resource, action), sem "name" (é o desenho do schema final da nuvem).
-- Como a F7 usa CREATE TABLE IF NOT EXISTS, em qualquer banco com a
-- migration de junho ela quebra no INSERT ... (name, ...) ON CONFLICT (name).
-- Adicionamos a coluna que falta (nullable, única) só para a F7 executar;
-- as linhas antigas ficam com name NULL e o catálogo de junho não muda.
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS name text;
CREATE UNIQUE INDEX IF NOT EXISTS permissions_name_key ON public.permissions (name);
