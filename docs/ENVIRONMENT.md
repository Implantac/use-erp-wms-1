# Variáveis de ambiente — USE ERP v1.0.0

O sistema tem duas camadas de configuração:

1. **Frontend** (`.env` na raiz) — lidas pelo Vite no build. Apenas valores públicos.
2. **Funções do servidor** (Supabase Edge Functions) — configuradas como *secrets* do projeto:
   `supabase secrets set NOME=valor`. Nunca coloque essas no `.env` do frontend.

## 0. Versionamento e provisionamento (SEC-02)

- **`.env` não é versionado.** O arquivo foi removido do índice do Git em 05/11/2026 e está ignorado por `.gitignore`. Use `.env.example` como modelo; nunca use `git add -f .env`.
- Cada ambiente injeta suas próprias variáveis: **Lovable/CI** pelo painel de Environment Variables, **instalação local** por `window.__USE_ERP_CONFIG__` (gerado em `/config.js` na subida do `web`) ou por `.env` local, **Supabase** por `supabase secrets set`.
- `src/integrations/supabase/config.ts` não contém valores fixos: prioriza config de runtime, depois `VITE_SUPABASE_*` e, na instalação local, `window.location.origin`. A ausência de `VITE_SUPABASE_PUBLISHABLE_KEY` não é substituída por chave embutida.
- O **histórico Git** pode conter a chave publicável de um projeto antigo. Chaves `anon`/publishable são públicas por natureza e a segurança depende do RLS, mas ainda assim recomenda-se **rotacionar as chaves do projeto legado** e não reutilizar seus identificadores. Reescrever o histórico de `main` foi descartado para não romper CI e a sincronização com o Lovable.
- Jobs `pg_cron`, triggers e o bundle do MCP que antes apontavam para um projeto legado com JWT fixo foram neutralizados ou parametrizados. Nenhum arquivo versionado contém o identificador desse projeto, JWT `anon` ou token de acesso: `scripts/check-hardcoded-project-refs.mjs` roda no CI e falha se qualquer um reaparecer.
- `supabase/config.toml` e `.lovable/mcp/manifest.json` usam o placeholder `project-ref-unset`; ajuste por ambiente (`supabase link` / rebuild do MCP) antes de publicar. `supabase/functions/mcp/index.ts` é **gerado no build** por `@lovable.dev/mcp-js` a partir de `src/lib/mcp/index.ts`: sem `VITE_SUPABASE_PROJECT_ID` ele usa `project-ref-unset` e deriva o *issuer* de `VITE_SUPABASE_URL`. Nenhum ref real é versionado; **não edite o bundle manualmente**, ou o step `Build não altera fontes rastreadas` falhará.
- Para reagendar ou habilitar notificações, defina no banco (fora do repositório):
  - `app.settings.supabase_url` → `https://<SEU-PROJETO>.supabase.co`
  - `app.settings.supabase_anon_key` → chave publicável do seu projeto
  - Sem esses valores, o trigger de incidente e as rotinas de notificação **falham fechados** (não enviam HTTP) e os jobs legados permanecem desativados. Nunca grave esses valores em uma migration.
- **Suíte unitária não depende de `.env`:** `vitest.config.ts` define `test.env` com URL/chave inertes e exclui `src/lib/testing/integration/**`. Esses dois testes falavam com um Supabase real e foram migrados para `tests/e2e/isolated-environment.spec.ts` (QA-01). Sem isso, o SEC-02 quebraria o CI: `createClient` lança na importação quando a chave está vazia.
- Ainda é necessário **rotacionar as chaves do projeto legado** e revogar o token GitHub que foi compartilhado em texto: remover do repositório não invalida o que já esteve exposto no histórico.

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
| `REINF_WS_ENDPOINT`, `REINF_CERT_A1_B64_<COMPANY_UUID_SEM_HIFENS>`, `REINF_CERT_A1_PASS_<COMPANY_UUID_SEM_HIFENS>` | Para EFD-Reinf | `reinf-transmit`, `reinf-cert-status` | Certificado A1 e senha exclusivos por empresa; sufixo UUID em maiúsculas, sem hífens. Segredos globais não são aceitos. Antes de implantar, migre cada empresa para segredos próprios. O subject do A1 deve conter o CNPJ da empresa e a validade deve estar vigente; outros formatos falham fechados até homologação. |
| `RFID_WEBHOOK_SECRET`, `RFID_WEBHOOK_API_KEY` | Opcional | `rfid-webhook` | Leitores RFID |
| `BRAIN_WEBHOOK_URL` | Opcional | IA executiva | Notificações externas |

Sem um secret opcional, a função correspondente **falha com segurança** (responde indisponível) — nunca simula sucesso.
