# Avaliação UX — Rodada 8 (10/11/2026)

> **Origem:** `"ok prossiga"` em resposta à indicação de que a próxima etapa técnica da lista era **UX7-03 — carregamento longo sem progresso** (§8 do relatório da r7). Não é autorização de commit/push: a autorização pontual `"Atualize o github"` foi consumida por `2ca213c` + `f49857f` (r6).
> **Escopo:** tornar a **retentativa visível**. A r7 já avisava quando o erro *consolidava*; faltava a janela entre a 1ª falha e esse momento, em que o React Query refaz a consulta e a tela continua em "Carregando..." sem dizer nada.
> **Status:** **apenas local**. A **r7 também continua local** — o worktree reúne **13 arquivos** (5 modificados + 8 novos, r7 + r8) aguardando uma única autorização de publicação. Sem rebuild/deploy.

---

## 1. Metodologia (falha induzida, determinística)

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-loading-audit.mjs` (`npm run ux:loading`), com `--assert`, `--wait`, `--label`, `--out` e `--no-notice` |
| Ambiente | Chromium 158 contra **frontend Vite local + API isolada QA-01** (504 migrations + 3 seeds, só loopback). Origens externas abortadas, `config.js` neutralizado. **Nenhum dado real, nenhuma credencial de produção** |
| Cenário | Para cada rota, a **1ª** consulta de lista recebe **503 com 700 ms de atraso**; as demais seguem para a API isolada. O `QueryClient` faz 1 retry — exatamente o comportamento real do produto. **Não mockamos o backend inteiro nem falsificamos persistência**: apenas induzimos a retentativa |
| Amostragem | DOM lido a cada **150 ms por 6 s** (40 amostras/rota): presença de carregamento, presença de aviso de retry, relógio absoluto |
| Rotas | `pedidos-venda` (`orders`), `pedidos-compra` (`purchase_orders`), `recebimento` (`products`) |
| **A/B controlado** | `--no-notice` injeta apenas um CSS que esconde `[data-ux-retry-notice]` e `[data-ux-retry-message]` **no mesmo build** — sem alterar código entre as medições |
| Evidências | `/home/user/ux-evidence/{antes,antes-ab,depois}-loading.json` (com `timeline` amostra a amostra) |

---

## 2. Achado clínico

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX7-03** | **Média** | **Retentativa invisível.** `src/modules/commercial/Orders.tsx` trocava a tela inteira por `<PageLoading message="Carregando pedidos..." />` enquanto `isLoading` — e durante o retry do React Query `isLoading` permanece `true`. O usuário via um spinner genérico por **2.863 ms** sem saber que o sistema já estava na 2ª tentativa. | `antes-loading.json`: 19 amostras carregando, `aviso=false`, `silencio=2863ms` |
| **UX8-01** | Média | **O aviso da r7 chega tarde de propósito.** `BackendErrorBanner` só aparece quando o erro **consolida** (`status === 'error'`). Nas 3 rotas medidas, o único texto disponível durante o retry era o próprio "Carregando..." — `semAvisoDeRetry=3/3`. | `antes-loading.json`: 3/3 sem aviso; `feedbackTexts` traz só o banner pós-erro |
| **UX8-02** | Baixa | **Carregamento não anunciado a leitor de tela.** `PageLoading` era uma `<div>` com spinner e texto, sem `role="status"` nem `aria-live`. | `src/shared/components/PageLoading.tsx` (versão `f49857f`) |

**Ponto positivo:** 0 vazamento técnico, 0 exceção JS, 0 tela presa ao final das 6 s nas 3 rotas. O problema é **falta de informação durante a espera**, não travamento.

### Correção de viés (registrada para não repetir)
A 1ª versão do `--assert` exigia `silentLoadingMs < 1500` **desde o início da página** e reprovou o DEPOIS com 1.655 ms. Hipótese **refutada**: esse intervalo é o **primeiro carregamento legítimo**, anterior a qualquer falha — não há como o sistema avisar que vai falhar antes de falhar. A métrica foi reformulada para **`noticeLatencyMs`**: tempo entre o início da retentativa (2ª chamada interceptada) e o aparecimento do aviso. O "silêncio do primeiro load" passou a ser **observação**, com apenas um limite de sanidade contra travamento real (> 4,5 s).

---

## 3. Correções implementadas

1. **`src/shared/components/PageLoading.tsx`** — agora `role="status"`, `aria-live="polite"`, `data-ux-loading="true"`; nova prop `retrying` acrescenta **"Tentando novamente…"** à mensagem e marca o trecho com `data-ux-retry-message`. Continua com o mesmo spinner/animação visual.
2. **`src/modules/commercial/Orders.tsx`** — `useOrders()` passa a expor `failureCount`; o `PageLoading` recebe `retrying={failureCount > 0}`. É o caso medido, com texto específico do módulo.
3. **Novo `src/shared/components/BackendLoadingNotice.tsx`** — observa o `QueryCache` e aparece **somente** durante uma retentativa real (`fetchFailureCount > 0 && fetchStatus === 'fetching' && getObserversCount() > 0`). Mostra *"Alguns dados estão demorando para carregar. Estamos tentando novamente…"* em `role="status"`. **Sem `animate-spin`**, para não ser confundido com tela travada nem regredir o `ux:resilience` da r7. Some automaticamente quando a consulta consolida — em sucesso ou em erro, quando o banner da r7 assume.
4. **`src/App.tsx`** — monta `BackendLoadingNotice` ao lado de `BackendErrorBanner`, dentro do `QueryClientProvider`. Cobertura global: qualquer tela futura herda o comportamento.
5. **`scripts/ux-loading-audit.mjs`** + script `ux:loading` em `package.json`.
6. **`src/shared/components/LoadingFeedback.test.tsx`** — **5 testes**: `PageLoading` anuncia estado, não menciona retry no 1º load, menciona durante retry; `BackendLoadingNotice` invisível no 1º carregamento, aparece durante retentativa sem vazar `PGRST`/`503`/JWT e desaparece quando a consulta tem sucesso.

**Camadas complementares:** `ModuleErrorBoundary` (r1) → crashes de render; `BackendErrorBanner` (r7) → erro consolidado; `BackendLoadingNotice` (r8) → janela de retentativa. Nenhuma substitui a outra.

---

## 4. Resultado A/B (mesmo build, `--no-notice`)

| Métrica (3 rotas) | ANTES | DEPOIS |
|---|---:|---:|
| **Rotas sem aviso de retentativa** | **3** | **0** |
| Latência do aviso após o início do retry | nunca | **145 / 0 / 125 ms** (limite 800 ms) |
| Vazamento técnico | 0 | 0 |
| Exceções JS / tela presa ao final | 0 / 0 | 0 / 0 |
| Silêncio do 1º carregamento (legítimo) | 2.727 ms | 1.807 ms (observação, não falha) |

`node scripts/ux-loading-audit.mjs --label=depois --assert` → **exit 0**: *"toda retentativa é anunciada em menos de 800ms, sem carregamento sem fim e sem vazamento técnico."*

---

## 5. Validações executadas

| Verificação | Resultado |
|---|---|
| `npm run ux:loading -- --assert` | ✅ exit 0 (A/B `antes-ab` → `depois`) |
| **8/8 audits `ux:* --assert`** | ✅ `ux:loading`, **`ux:resilience` (r7, sem regressão)**, `ux:task`, `ux:labels`, `ux:a11y`, `ux:journey`, `ux:links` (105 rotas / 0 quebradas), `ux:responsive` |
| `npm test` (vitest) | ✅ **98 arquivos / 457 testes** (452 da r7 + 5 novos) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos** |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` | ✅ **24/24** |
| SEC-02 | ✅ **2678 arquivos / 0 referências fixas** (após `git checkout -- supabase/functions/mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |

**Não executado:** `typecheck`/`build` locais (limitação de sandbox registrada desde a r5: `tsgo`/Vite excedem o timeout). Como **não houve push**, o CI não rodou sobre r7/r8 — **não declaramos typecheck verde para estas duas rodadas**. A cobertura real é lint, 457 testes, 32 specs E2E, 8 audits de browser e compilação/execução Vite em HMR.

---

## 6. Limitações declaradas

- O aviso global é **intencionalmente genérico**: não diz qual módulo nem expõe nomes de tabela/query (evita vazamento técnico). `Orders.tsx` é o único com mensagem específica.
- O 503 é **induzido apenas na 1ª consulta de lista** para tornar o retry determinístico. Ele mede o comportamento de UI durante a retentativa; **não prova persistência de dados**.
- O "silêncio" de ~1,8 s no primeiro carregamento **não foi tratado como defeito**: é carregamento inicial normal, já com `role="status"` e spinner. Corrigi-lo exigiria um timer artificial que geraria ruído em carregamentos saudáveis.
- `ux:resilience` continua contando `.animate-spin` como possível tela presa; por isso o novo aviso **não usa spinner animado**. Confirmado: o audit da r7 segue verde.
- Nenhuma leitura do Google Drive nesta rodada (app conectado, não consultado).

---

## 7. O que **não** foi feito

- **Sem commit, push, rebuild ou deploy.** `origin/main` segue em `f49857f`. O worktree tem **13 arquivos** (5 modificados + 8 novos): `package.json`, `src/App.tsx`, `src/modules/commercial/Orders.tsx`, `src/shared/components/PageLoading.tsx`, o índice, os 2 relatórios (r7/r8), os 2 audits (`ux:resilience`, `ux:loading`), os 2 componentes (`BackendErrorBanner`, `BackendLoadingNotice`) e as 2 suítes de teste. Uma única autorização publicaria as duas rodadas.
- **Nenhuma alteração em produção, banco real, migrations, grants, RLS ou gate**; nenhum dado de cliente; nenhum segredo/PAT/`.env` versionado. Servidores parados, `.env.e2e.generated`, `tests/harness/data`, locks e `mcp/index.ts` regenerado limpos.
- **Sem autenticação ou smoke em produção**; sem mock de backend para forçar caminho feliz.
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px, 11 textos de paleta, zoom 200%, viewport 320 px, 7 dívidas do gate, 1236 `no-explicit-any`.
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild" (r4 já publicada). Fora do escopo, mantido sem pedido.

---

## 8. Próximos passos

1. **Publicar r7 + r8 juntas** — exige autorização pontual para commit/push; depois rebuild no Lovable pelo usuário. Sem isso, o deploy segue com r1–r6 e o CI não valida typecheck destas rodadas.
2. **Caminho feliz real** — depende de evoluir o harness isolado para suportar os JOINs que hoje retornam 400. É infraestrutura de teste, não UX; registrar decisão antes de implementar.
3. **Leitor de tela real**, fluxos de **edição**, ampliar amostra para Fiscal/Financeiro/Qualidade/PCP, zoom 200% e 320 px.
4. **Dívidas congeladas** — 22 alvos < 24 px e 11 textos de paleta exigem decisão de design.
5. **Governança (bloqueante, fora de UX):** revogar/rotacionar o PAT (8 usos anteriores + 3 na r6), `anon`/JWT legado e credenciais do `Usehub.xlsx`; 18 segredos via secret manager; G-01/G-02; grant/RLS formal; fiscal/SEFAZ, PSP, restore, piloto e aceite formal. **NO-GO** permanece.

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && npx playwright install chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:loading -- --label=antes-ab --no-notice --out=/home/user/ux-evidence
npm run ux:loading -- --label=depois --assert --out=/home/user/ux-evidence
npm run ux:resilience -- --assert --wait=8000
npm test && npm run lint:ci
```

---

## 10. Conclusão

A r7 curou o **erro silencioso**; a r8 cura a **espera silenciosa**. Medimos com falha induzida que, entre a primeira falha e o erro consolidado, o usuário ficava quase 3 s diante de "Carregando pedidos..." sem saber que o sistema já tentava de novo. Agora a retentativa é anunciada em **menos de 800 ms** nas 3 rotas, o carregamento é anunciado a leitores de tela e nenhuma das camadas anteriores regrediu.

Também está registrada a **hipótese que refutei**: cobrar "silêncio" desde o início da página penalizava o primeiro carregamento legítimo. A métrica corrigida mede a latência a partir do retry — o que realmente importa.

**CI verde não é evidência de aplicação utilizável** — e aqui o CI sequer rodou, porque r7 e r8 ainda não foram publicadas. O status geral do projeto continua **NO-GO**. Para o usuário final perceber qualquer destas duas rodadas, falta autorização para publicar e um rebuild no Lovable.
