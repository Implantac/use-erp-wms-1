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

### 0.1 Publicação no Lovable — incidente `supabaseKey is required.`

**Sintoma:** depois de sincronizar um commit a partir de `9080eead` (SEC-02) e publicar, o navegador abre em tela branca e o console mostra `Uncaught Error: supabaseKey is required.` em `new SupabaseClient` -> `createClient` -> `src/integrations/supabase/client.ts`.

**Causa:** o `.env` deixou de ser versionado. Ao sincronizar, o arquivo sai do workspace do Lovable; se as variáveis não estiverem no painel, o `vite build` produz o bundle com `VITE_SUPABASE_PUBLISHABLE_KEY` vazia. `getSupabasePublishableKey()` devolve `""` e `createClient` é chamado já na importação do módulo, antes de qualquer tela renderizar. **O CI não detecta isso:** o step `Build não altera fontes rastreadas` compara o diff das fontes geradas, não executa o bundle com variáveis reais de ambiente.

**Correção — no painel do Lovable, não no repositório:**

1. Em *Project Settings > Environment Variables*, cadastre as três variáveis obrigatórias com os valores do **SEU** projeto Supabase (*Settings > API*):
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave pública `anon` / publishable
   - `VITE_SUPABASE_PROJECT_ID` = `<ref>` (usado pelo MCP e pelas URLs de webhook)
2. **Gere um novo build e publique novamente.** Variáveis `VITE_*` são embutidas no JS pelo Vite no momento do build; salvar a variável sem republicar não altera o bundle já servido.
3. Abra o app e confirme no console que o erro desapareceu e que as requisições vão para o domínio `.supabase.co` esperado. Sem `VITE_SUPABASE_URL`, `getSupabaseUrl()` cai para `window.location.origin` e a API responde 404 mesmo com a chave correta.

**Não** volte a versionar `.env` e **não** reutilize a chave do projeto legado que esteve no histórico: rotacione-a antes de usar. A chave `anon` é pública por natureza, mas a segurança depende de RLS revisado.

**INC-02 (06/11/2026):** o bot do Lovable publicou o merge `3e23d4f` ("Corrigiu env público e republicou") que **reintroduziu `.env` no índice**, removeu sua linha do `.gitignore`, fixou o ref do projeto legado em `.lovable/mcp/manifest.json` e em `supabase/functions/mcp/index.ts` (editando manualmente o bundle gerado) e registrou em `AGENTS.md` a instrução de nunca ignorar o arquivo. O `CI` `42230942234` falhou no step `Sem projeto, JWT ou token fixo no código (SEC-02)`. A correção remove `.env` do índice **sem apagá-lo do disco e sem reescrever histórico**, restaura `.gitignore`, o manifest com `project-ref-unset` e o bundle gerado, e substitui a instrução incorreta. Versionar segredo não é correção aceitável: se o Lovable fizer um novo publish sem as variáveis no painel, `supabaseKey is required.` retorna.

**INC-03 (06/11/2026):** o merge `d03f9f6` ("Configuração ERP pública fixada") inseriu em `src/integrations/supabase/config.ts` as constantes `HOSTED_URL`/`HOSTED_KEY` (URL e JWT `anon` do projeto legado em texto claro) e `isLovableHosted()`, que as devolve **apenas** em domínios `.lovable.app` / `.lovableproject.com`. O app publicado voltou a abrir, mas à custa do `CI` `42239516941` ❌ no gate SEC-02, da chave exposta no bundle e de quebra em qualquer outro domínio. O bundle servido (`erp-core-Db26LUJn.js`) foi inspecionado: `getSupabasePublishableKey()` nele **não lê** `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`, confirmando que aquele build não recebeu as variáveis do painel.

**Correção acordada com o responsável:** cadastrar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` no painel do Lovable e **gerar um novo build**. Como `getSupabasePublishableKey()` prioriza `import.meta.env` sobre o fallback, o app passa a usar o painel sem indisponibilidade; só então removem-se `HOSTED_URL`/`HOSTED_KEY`/`isLovableHosted()` e restauram-se o manifest (`project-ref-unset`) e o bundle MCP gerado. **Remover o fallback antes desse rebuild derruba a publicação.** Rotacionar as chaves legadas continua pendente e urgente: cadastrá-las no painel não invalida o que já esteve exposto no histórico, no código-fonte e no JS público.

**Evidência de aceite:** build com as variáveis presentes, smoke de login e uma leitura autenticada, com commit, ambiente, data e responsável registrados. Até essa evidência existir, a publicação permanece **NO-GO**.

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
