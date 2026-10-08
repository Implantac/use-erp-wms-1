# Variáveis de ambiente — USE ERP v1.0.0

O sistema tem duas camadas de configuração:

1. **Frontend** (`.env` na raiz) — lidas pelo Vite no build. Apenas valores públicos.
2. **Funções do servidor** (Supabase Edge Functions) — configuradas como *secrets* do projeto:
   `supabase secrets set NOME=valor`. Nunca coloque essas no `.env` do frontend.

## 1. Frontend (`.env`)

| Variável | Obrigatória | Finalidade | Onde obter | Risco |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Sim | Endereço da API do banco/autenticação | Supabase > Settings > API | Público |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | Chave anon (acesso limitado pelo RLS) | Supabase > Settings > API | Público; a segurança vem do RLS |
| `VITE_SUPABASE_PROJECT_ID` | Sim | Ref do projeto (usado em URLs de webhooks e MCP) | Subdomínio da URL | Público |
| `DATABASE_URL` | Só no setup | Aplicar migrations via `npm run setup` | Supabase > Settings > Database | **Secreto** — dá acesso total ao banco |

## 2. Secrets das funções do servidor

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pelo Supabase.

| Secret | Obrigatória | Usada por | Finalidade |
|---|---|---|---|
| `SITE_URL` / `PUBLIC_APP_URL` | Recomendada | convites, e-mails, NPS | URL pública do seu frontend |
| `ALLOWED_ORIGINS` | Recomendada | CORS das funções | Domínios autorizados, separados por vírgula |
| `CRON_SECRET` | Sim, se usar agendamentos | funções agendadas | Autentica chamadas do pg_cron |
| `LOVABLE_API_KEY` | Opcional | módulos de IA (`ai-*`, `cx-*`, `nps-ai-analyze`) | Gateway de IA. Sem ela, os recursos de IA retornam indisponível |
| `RESEND_API_KEY`, `INCIDENT_EMAIL_FROM`, `COMMERCE_NOTIFY_FROM` | Opcional | e-mails transacionais | Envio de e-mails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_WEBHOOK_SECRET` | Opcional | assinatura SaaS | Cobrança das assinaturas |
| `PSP_WEBHOOK_SECRET`, `PIX_WEBHOOK_SECRET` | Opcional | PIX/PSP | Validação de webhooks do provedor de pagamento |
| `PIX_SIMULATION_ENABLED` | **Manter vazio em produção** | PIX | Somente homologação |
| `SEFAZ_MTLS_PROXY_URL`, `SEFAZ_MTLS_PROXY_TOKEN`, `SEFAZ_WEBHOOK_SECRET` | Para emissão fiscal | NF-e/eventos | Proxy mTLS em `infra/sefaz-mtls-proxy` |
| `REINF_WS_ENDPOINT`, `REINF_CERT_A1_B64_<COMPANY_UUID_SEM_HIFENS>`, `REINF_CERT_A1_PASS_<COMPANY_UUID_SEM_HIFENS>` | Para EFD-Reinf | `reinf-transmit`, `reinf-cert-status` | Certificado A1 e senha exclusivos por empresa; sufixo UUID em maiúsculas, sem hífens. Segredos globais não são aceitos. Antes de implantar, migre cada empresa para segredos próprios. |
| `RFID_WEBHOOK_SECRET`, `RFID_WEBHOOK_API_KEY` | Opcional | `rfid-webhook` | Leitores RFID |
| `BRAIN_WEBHOOK_URL` | Opcional | IA executiva | Notificações externas |

Sem um secret opcional, a função correspondente **falha com segurança** (responde indisponível) — nunca simula sucesso.
