-- Inscrição Estadual (IE) da empresa e da unidade.
-- A coluna segue o mesmo nome já usado em public.clients
-- (state_registration), para a ficha fiscal da empresa/unidade deixar de
-- viver em texto livre. Aditiva e reversível (DROP COLUMN desfaz).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS state_registration text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS state_registration text;

COMMENT ON COLUMN public.companies.state_registration IS
  'Inscrição Estadual da empresa (ficha fiscal).';
COMMENT ON COLUMN public.branches.state_registration IS
  'Inscrição Estadual da unidade, quando diferente da matriz.';
