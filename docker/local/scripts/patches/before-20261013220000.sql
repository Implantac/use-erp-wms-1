-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20261013220000 adiciona a FK production_orders.route_id ->
-- production_routes.id, mas route_id nasceu TEXT e production_routes.id é
-- UUID: o Postgres recusa a FK ("incompatible types: text and uuid") em
-- qualquer banco com esse desenho. A intenção da coluna sempre foi guardar
-- o UUID da rota (é assim que o trigger generate_op_steps_from_route e o
-- app a usam). Convertemos a coluna para UUID antes da FK.
-- Numa instalação nova a tabela está vazia; valores que não sejam UUID
-- viram NULL em vez de abortar a instalação (referências inválidas já
-- seriam órfãs para a FK de qualquer forma).
ALTER TABLE public.production_orders
  ALTER COLUMN route_id TYPE uuid
  USING (CASE WHEN route_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN route_id::uuid ELSE NULL END);
