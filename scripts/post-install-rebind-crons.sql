-- USE ERP — reapontar agendamentos (pg_cron) para o SEU projeto.
-- Algumas migrations históricas registram jobs com a URL do ambiente de origem.
-- Rode UMA vez após aplicar as migrations, no SQL Editor do seu projeto ou via psql:
--   psql "$DATABASE_URL" -v new_url="'https://SEU-PROJETO.supabase.co'" -v new_anon="'SUA_ANON_KEY'" -f scripts/post-install-rebind-crons.sql

UPDATE cron.job
SET command = regexp_replace(command, 'https://[a-z0-9]+\.supabase\.co', :new_url, 'g')
WHERE command ~ 'https://[a-z0-9]+\.supabase\.co';

UPDATE cron.job
SET command = regexp_replace(command, 'Bearer eyJ[A-Za-z0-9._-]+', 'Bearer ' || :new_anon, 'g')
WHERE command ~ 'Bearer eyJ';

SELECT jobname, schedule, left(command, 120) AS command FROM cron.job ORDER BY jobname;
