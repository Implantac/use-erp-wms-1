-- Patch LOCAL (não é migration do projeto) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260626003808 chama cron.unschedule('ai-brain-autopilot-daily')
-- e cron.unschedule('ai-brain-weekly-learning') sem verificar existência.
-- O segundo job só existia no banco da nuvem (criado fora das migrations —
-- a migration 20260529025935 cria 'brain-weekly-learning', sem o prefixo ai-),
-- e cron.unschedule de job inexistente levanta erro em banco vazio.
-- Criamos os dois como jobs inertes ("SELECT 1") só para o unschedule da
-- migration removê-los em seguida — efeito final idêntico ao da nuvem.
SELECT cron.schedule('ai-brain-autopilot-daily', '0 0 * * *', 'SELECT 1')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-brain-autopilot-daily');

SELECT cron.schedule('ai-brain-weekly-learning', '0 0 * * 0', 'SELECT 1')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-brain-weekly-learning');
