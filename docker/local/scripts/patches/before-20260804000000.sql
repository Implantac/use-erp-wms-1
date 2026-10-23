-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260804000000 cria um trigger sobre public.stock_transfers,
-- tabela que NÃO é criada por nenhuma migration e nem existe no schema
-- final gerado da nuvem (o app usa public.stock_transfer_orders; as colunas
-- citadas — origem_branch_id/canal_origem/quantidade — são de um desenho
-- antigo). Num banco que um dia teve essa tabela ela aplicou; num banco
-- vazio, quebra no CREATE TRIGGER.
-- Criamos a tabela vazia, só com as colunas que a função do trigger lê,
-- com RLS ligado e sem nenhuma policy (ninguém acessa via API). É uma
-- tabela morta: nenhum código atual a consulta.
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  origem_branch_id uuid,
  canal_origem text,
  quantidade numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
