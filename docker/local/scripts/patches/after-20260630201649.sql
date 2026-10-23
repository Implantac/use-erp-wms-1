-- Patch LOCAL (depois) — remove o usuário stub criado pelo before-20260630201649.
-- O DELETE em auth.users apaga em cascata o profile e os user_roles que a
-- migration inseriu para o UUID da nuvem. Sem senha, o stub nunca pôde logar.
DELETE FROM auth.users WHERE id = '9f07c8a3-eaec-42c9-9a22-6603fe7a1125';
