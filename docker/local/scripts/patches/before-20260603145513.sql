-- Patch LOCAL (não é migration do projeto) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260603145513 cria a "Empresa Padrão" se não houver nenhuma,
-- mas o INSERT dela só informa (id, name) — e public.companies.cnpj é NOT NULL
-- sem default. Na nuvem de origem já existia uma empresa cadastrada, então o
-- INSERT nunca executava; num banco local vazio ele quebra.
-- Aqui criamos a mesma empresa padrão ANTES, já com CNPJ placeholder, para a
-- migration encontrar a empresa e seguir. O usuário troca nome/CNPJ reais em
-- Configurações → Empresa no primeiro acesso (é a empresa que a própria
-- migration criaria).
INSERT INTO public.companies (name, cnpj)
SELECT 'Empresa Padrão', '00000000000000'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);
