# Instalação em 15 passos — USE ERP v1.0.0

Pré-requisitos: Node 18+ (recomendado 22), npm, conta Supabase, [Supabase CLI](https://supabase.com/docs/guides/cli). Opcional: `psql`, Docker.

1. `git clone <seu-repositorio> use-erp && cd use-erp`
2. `npm install`
3. Crie um projeto novo no Supabase (região mais próxima dos usuários).
4. `cp .env.example .env` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (ver `docs/ENVIRONMENT.md`).
5. Em `supabase/config.toml`, troque `project_id` pelo ref do **seu** projeto.
6. `supabase login && supabase link --project-ref SEU_REF`
7. Aplique o banco: `supabase db push` **ou** `npm run setup -- --migrate` (usa `DATABASE_URL` + `psql`).
8. Reaponte os agendamentos: `psql "$DATABASE_URL" -v new_url="'https://SEU_REF.supabase.co'" -v new_anon="'SUA_ANON_KEY'" -f scripts/post-install-rebind-crons.sql`
9. Publique as funções do servidor: `supabase functions deploy`
10. Configure os secrets necessários: `supabase secrets set SITE_URL=https://seu-dominio CRON_SECRET=$(openssl rand -hex 32)` (lista completa em `docs/ENVIRONMENT.md`).
11. Em Supabase > Authentication > URL Configuration, defina *Site URL* e *Redirect URLs* com o seu domínio.
12. `npm run setup` — deve terminar com "Ambiente pronto".
13. `npm run dev` e abra `http://localhost:8080`.
14. Crie a conta pela tela de cadastro. **O primeiro usuário recebe o papel de administrador**; o assistente inicial cria a empresa (tenant) e a primeira unidade.
15. Convide os demais usuários em *Administração > Usuários* e atribua papéis (admin, manager, operator, viewer).

## Validação
- `npm run typecheck` · `npm test` · `npm run build`
- E2E (opcional): `npm run e2e` com usuário de teste configurado em `E2E_EMAIL`/`E2E_PASSWORD`.

## Limitações conhecidas
- Emissão fiscal oficial exige provedor/proxy SEFAZ com certificado A1 — sem ele, a emissão retorna indisponível (sem simulação).
- PIX/boleto/TEF exigem contrato com provedor de pagamento.
- Ver `docs/FEATURE_STATUS.md`.
