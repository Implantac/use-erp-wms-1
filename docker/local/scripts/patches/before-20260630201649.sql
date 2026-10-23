-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260630201649 é uma correção de dados para UM usuário que só
-- existia na nuvem de origem (UUID fixo no código, a conta de suporte
-- legada): ela insere papéis admin/system_admin para ele em todas as
-- empresas e quebra por FK (user_roles -> auth.users) num banco local vazio.
-- NÃO recriamos a conta de suporte de verdade. Criamos apenas um usuário
-- "stub" sem senha (não consegue logar: encrypted_password NULL), só para a
-- migration executar — e o patch after-20260630201649 o apaga em seguida
-- (os papéis somem em cascata). Resultado final local: nenhum resíduo.
INSERT INTO auth.users (id, email)
VALUES ('9f07c8a3-eaec-42c9-9a22-6603fe7a1125', 'stub-migracao-local@invalid.local')
ON CONFLICT (id) DO NOTHING;
