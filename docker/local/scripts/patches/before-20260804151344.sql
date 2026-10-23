-- Patch LOCAL (antes) — ver migrate.sh, mecanismo before-<versão>.
-- A migration 20260804151344 atualiza o plano 'enterprise' e insere seus
-- módulos em plan_modules com plan_id NOT NULL. Na nuvem o plano existia
-- (catálogo semeado fora das migrations; a migration anterior, de suporte,
-- também o criava quando achava a conta legada). Num banco local vazio,
-- ent_plan_id fica NULL e o INSERT quebra.
-- Garantimos o plano enterprise (sem atribuí-lo a nenhuma empresa/usuário —
-- a parte da migration que mexeria na assinatura só roda se a conta de
-- suporte existir, o que não é o caso localmente).
INSERT INTO public.plans (name, slug, price_monthly, price_annual, allowed_modules, is_active, max_users, max_companies, ai_calls_per_month)
VALUES (
  'Enterprise',
  'enterprise',
  0,
  0,
  ARRAY['admin','comercial','financeiro','estoque','producao','fiscal','wms','nps','executivo','use_success','cerebro_nativo','contabilidade','governanca','marketplace','crm','saude','agro','construcao','educacao'],
  true,
  9999,
  999,
  -1
)
ON CONFLICT (slug) DO NOTHING;
