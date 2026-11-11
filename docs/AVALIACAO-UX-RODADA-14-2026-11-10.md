# Avaliação UX — Rodada 14 (11/11/2026)

> **Origem:** `"ok tudo publicado pelo lovable, continue com as melhorias"` (desenvolvimento) e `"Atualize o github usando o token …"` (publicação **pontual** da r14). Não autoriza rebuild/deploy pelo assistente, smoke autenticado em produção, dados reais, aceite presumido nem push permanente.
> **Status:** **publicada no GitHub** em **`dc7bf42`** (`611a2fc..dc7bf42`, 10 arquivos, +372/−17), a pedido expresso. **A r14 ainda não está no deploy** — o bundle conferido contém r7–r13 e exige **novo rebuild no Lovable pelo usuário**.
> **Frente escolhida:** depois de r12/r13 provarem que **todo controle tem nome**, faltava provar que o nome está **no idioma do usuário**. r14 mede e corrige nomes de UI em inglês na árvore de acessibilidade.
> **Ferramenta:** `locator.ariaSnapshot()` (Chromium), **não** é escuta com NVDA/VoiceOver.
> **Série de arquivos:** mantém o sufixo `2026-11-10` por coerência com as rodadas 1–13.

## 0. 19ª saturação (antes da publicação)

Ao receber o pedido de publicação, o workspace tinha **1728 arquivos**, `.git` **ausente**, deps/Chromium **0**. Sobreviveram apenas 4 arquivos da r14 (`package.json`, índice, relatório e `scripts/ux-i18n-audit.mjs`); os 6 componentes base tinham desaparecido. Backups em `/home/user/ux-r15-backup`, clone raso público de `611a2fc` em `/tmp/ux16-reclone`, `cp -a .git` + `git reset --hard 611a2fc` + `git clean -fd` e restauração dos 4 sobreviventes. **Diferente da 18ª saturação**, nenhum `tar` foi usado: nenhuma modificação foi sobrescrita na extração. As 6 traduções foram reaplicadas sobre o baseline publicado, e deps/harness/Chromium reinstalados antes de medir. Toda a bateria de validação foi repetida **após** a reconstrução (§6).

---

## 1. Conferência do deploy (leitura pública, sem autenticação)

| Item | Resultado |
|---|---|
| `GET /` | **HTTP 200**, 14.211 bytes |
| Entradas | `index-DAGCZii0.js`, `index-DyXfT0zM.css`, `erp-core-CVooHtmc.js`, `vendor-react-0Vx8VMha.js`, `vendor-ui-DBkekOS0.js` — **hashes novos** (antes: `index-DZI4eJHm.js` / `index-Ds9o8DYG.css`) |
| Download | **404 assets / 13.406.624 bytes**, sequencial com UA (sem paralelismo, que derrubou o shell em r1) |
| Marcadores | **15/15 presentes**: `data-ux-backend-error`, `data-ux-retry-notice`, `data-ux-retry-message`, `data-ux-loading`, `data-ux-label-source`, `Novo Pedido de Venda`, `Nome do fornecedor (informar manualmente)`, os 4 `Filtrar por …` da r13, `Cliente cadastrado com sucesso!`, o fallback acionável da r9 e os toasts de edição/exclusão da r10 |

**O que isso prova:** o rebuild do Lovable realmente serviu o código de **r7–r13**. **O que NÃO prova:** autenticação, RLS em produção, cadastro de cliente funcionando, fluxo confirmado por usuário, aceite formal. Nenhum dado real foi acessado; nenhum smoke autenticado foi executado. **CI verde e bundle presente não são evidência de aplicação utilizável.** O parecer técnico segue **NO-GO**.

---

## 2. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-i18n-audit.mjs` (`npm run ux:i18n`) com `--assert`, `--label`, `--out` |
| Cobertura dinâmica | **12 rotas** + **5 diálogos de negócio**, `body`/`dialog.ariaSnapshot()`, **784 nós** |
| Cobertura estática | varredura de **6 componentes base** (`dialog`, `sheet`, `pagination`, `carousel`, `sidebar`, `breadcrumb`) por 11 strings exatas de UI em inglês — cobre componentes não abertos nos cenários, sem depender de dados do isolado |
| Classificação | nomes **exatos** de verbos/rotulos de UI em inglês (`Close`, `Next`, `Previous`, `Go to … page`, `Toggle Sidebar`…) + padrões. Nomes próprios e termos de negócio (`Use Success Portal`, `PIX`, `RFID`, `Dashboard`) **não** entram na lista |
| Ambiente | Chromium + API isolada QA-01 (504 migrations + 3 seeds, RLS real, só loopback), origens externas abortadas, `config.js` neutralizado |
| Evidências | `/home/user/ux-evidence/{antes-ab,depois}-i18n.json` |

O parser reaproveita a **fronteira de token** da r13 (`tab` não casa com `tablist`) e normaliza escalares YAML entre aspas.

---

## 3. Achado: UX14-01 — nomes de UI em inglês

| Onde | Antes | Origem |
|---|---|---|
| 5 diálogos de negócio | botão de fechar anunciado **`Close`** (5×; 8× contando todas as abas na r12) | `src/ui/base/dialog.tsx:63` (`sr-only`) |
| `sheet.tsx` | `Close` | painéis laterais (não abertos nos 12+5 cenários) |
| `pagination.tsx` | `aria-label="pagination"`, `Go to previous page`, `Go to next page`, `Previous`, `Next`, `More pages` | shadcn sem tradução; usado por `DataTable`/`ResultsGrid` |
| `carousel.tsx` | `Previous slide`, `Next slide` | `sr-only` |
| `sidebar.tsx` | `Toggle Sidebar` (3×: `sr-only`, `aria-label`, `title`) | `SidebarTrigger`/`SidebarRail` |
| `breadcrumb.tsx` | `More` | `sr-only` |

Nenhum teste ou spec E2E dependia desses nomes (conferido antes de editar).

**Por que os audits anteriores não viam:** `ux:labels`, `ux:aria` e `ux:aria:routes` verificam **presença** e **fidelidade** do nome, não **idioma**. Um controle chamado `Close` passa em todos eles.

---

## 4. Correções (apenas locais)

| Arquivo | Antes → Depois |
|---|---|
| `src/ui/base/dialog.tsx` | `Close` → **`Fechar`** |
| `src/ui/base/sheet.tsx` | `Close` → **`Fechar`** |
| `src/ui/base/pagination.tsx` | `pagination` → **`Paginação`**; `Go to previous page` → **`Ir para a página anterior`**; `Go to next page` → **`Ir para a próxima página`**; `Previous`/`Next` → **`Anterior`/`Próxima`**; `More pages` → **`Mais páginas`** |
| `src/ui/base/carousel.tsx` | `Previous slide`/`Next slide` → **`Slide anterior`/`Próximo slide`** |
| `src/ui/base/sidebar.tsx` | `Toggle Sidebar` → **`Alternar menu lateral`** (3 ocorrências) |
| `src/ui/base/breadcrumb.tsx` | `More` → **`Mais`** |

API dos componentes, `displayName`, variantes e comportamento **inalterados**. Nenhum `placeholder` virou nome, nenhum gate foi relaxado.

---

## 5. A/B controlado

Controle feito com `git checkout --` nos **6 arquivos de produto** (mantendo audit e `ux:i18n` constantes), 4 s de HMR entre estados.

| Estado | Nós | Nomes em inglês na árvore | Strings nos componentes base |
|---|---:|---:|---:|
| **A — HEAD publicado `611a2fc`** | 784 | **5** (`Close`) | **12** |
| **B — r14 local** | 784 | **0** | **0** |

```
[i18n] 12 rotas + 5 dialogos | nos=784 | nomesEmIngles=0 |
distintos=0 | stringsBase=0 | erros=0
UX I18N ASSERT OK: 12 rotas e 5 dialogos anunciam controles em PT-BR
e os componentes base nao guardam strings de UI em ingles.
```

### Viés do próprio audit (corrigido)
O primeiro `--assert` do estado B reprovou com `1 string`: **o meu próprio comentário** em `pagination.tsx` citava `"More pages"` ao documentar a tradução, e o guard estático o encontrou. Reescrevi o comentário — **não** afrouxei o validador. Medição refeita: `0/0`.

---

## 6. Validação

| Verificação | Resultado |
|---|---|
| `ux:* --assert` (**16/16**, incluindo `ux:i18n`) | ✅ todos verdes |
| `npm test` | **101 arquivos / 473 testes** ✅ |
| `npm run lint:ci` | **0 erros, 0 warnings** (1236 `no-explicit-any` por dívida conhecida) |
| `node --test scripts/e2e-isolated-lib.test.mjs` | **11/11** |
| `tsc` dirigido aos 9 arquivos TS de `src/ui/base` alterados | **exit 0** |
| `e2e:public` / `e2e:isolated` | **8/8** e **24/24** ✅ |
| SEC-02 | **2694 arquivos / 0 referências** ✅ (repetido após a reconstrução) |
| Gate `validate-e2e-no-skip.mjs` | **0** / `--strict` **exit 2** pelas 7 dívidas conhecidas (esperado) |
| Segredos do workflow | **18**, `workflowDiff=0`; token real/versionado = **0** |
| `git diff --check` | **0** |

### CI sobre `dc7bf42` (GitHub Actions, leitura pública sem token)

| Run | Resultado |
|---|---|
| **CI `43103025246`** | ✅ **3/3 jobs**: Typecheck explícito + lint + unitários + guardas RLS + SEC-02; Harness de banco; **Build de produção** |
| **Playwright `43103025271`** | Smoke público ✅ · E2E isolado QA-01–QA-05 ✅ · jornadas autenticadas ❌ **apenas no step 4 `Validate isolated E2E configuration`** (18 segredos não configurados); steps 5–8 `skipped`. Mesma falha já registrada nas r5/r6/r7–r13, **não é regressão** |

Jobs de CI conferidos passo a passo: `Typecheck explícito e não vazio`, `Sem projeto, JWT ou token fixo no código (SEC-02)`, `Guardas RLS falham fechado` e `Build` todos ✅. Isso fecha a limitação **"sem CI/build sobre r14"**.

**Limitações declaradas:** `npm run typecheck` completo morre por **SIGKILL/OOM** do `tsgo` no sandbox (não é erro de tipo); `tsc` dirigido passou e o **CI executou o typecheck explícito com sucesso**. O guard estático cobre **6 arquivos**, não todo o `src/`. **Nenhum leitor de tela real.** A conferência do deploy foi **read-only**, sem autenticação nem dados reais. **CI verde não é evidência de aplicação utilizável.**

---

## 7. Higiene e estado

- Servidores `api-isolada-rodada-14-*` / `erp-frontend-rodada-14-*` e os de publicação **parados**; portas 4179/54321 livres.
- Removidos `.env.e2e.generated`, locks, `tests/harness/data*`, `e2e/test-results`, `playwright-report-isolated`, `/tmp/ux15-ab`, `/tmp/ux16-*` e `/home/user/ux-r15-backup`; `supabase/functions/mcp/index.ts` restaurado.
- Publicação: **`dc7bf42`** (`611a2fc..dc7bf42`, 10 arquivos, +372/−17) + commit documental de alinhamento. `git ls-remote origin main` = mesmo hash do `HEAD`; worktree limpo.
- **Token da publicação:** usado **somente** via `/tmp/ux16-token` + `/tmp/ux16-askpass.sh` nos 2 pushes. Valor **não registrado**; arquivos e logs removidos. `gitConfigToken=0`, `tokenVersionado=0`, `tokenNoStage=0`, zero token em `.git/config`, workspace ou histórico. A autorização foi **pontual e consumida**.
- **PATs:** os de r6, 11/11, o reenviado em 11/11 e **o desta publicação** seguem **pendentes de revogação** — o último apareceu na conversa.

---

## 8. Próximos passos

1. **Novo rebuild no Lovable pelo usuário** para que `Fechar`/`Paginação`/`Anterior` cheguem ao deploy. A r14 já está no GitHub (`dc7bf42`), mas o bundle conferido contém apenas r7–r13 e continua com `Close` nos diálogos.
2. **Revogar os 4 PATs** e rotacionar `anon`/JWT/`Usehub.xlsx` — ação do usuário, não automatizada.
3. **Leitor de tela real (NVDA/VoiceOver)** para validar pronúncia, ordem de leitura e anúncios dinâmicos.
4. **Harness para JOINs 400**, mutações no gate de regressão, dívidas congeladas (22 alvos < 24 px, zoom 200%, viewport 320 px).
5. **Governança do NO-GO:** 18 segredos via secret manager, grant/RLS formal, smoke autenticado em produção, fiscal/SEFAZ, PSP, restore, piloto e aceite formal.

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && (cd tests/harness && npm install)
npx playwright install chromium && npx playwright install-deps chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npx vite --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:i18n -- --label=depois --assert --out=/home/user/ux-evidence
```

---

## 10. Conclusão

A r12/r13 responderam **"todo controle tem nome?"**. A r14 perguntou **"e o nome está em português?"**. A resposta foi não: o fechar dos diálogos era anunciado como `Close`, e 6 componentes base guardavam 12 strings de UI em inglês vindas do shadcn. Traduzidos sem tocar em API, comportamento ou gate: **5 + 12 → 0 + 0**, com 16/16 audits, 473 testes e E2E completos verdes.

O deploy do Lovable foi **conferido por leitura pública**: 404 assets e os 15 marcadores de r7–r13 estão no bundle. Isso fecha a dúvida sobre o rebuild, **não** fecha o NO-GO: não houve smoke autenticado, dados reais ou aceite. A r14 foi **publicada no GitHub** (`dc7bf42`) com CI 3/3 ✅ e Playwright com a única falha conhecida dos 18 segredos — mas **ainda não está no bundle**: depende de mais um rebuild pelo usuário.

**CI verde não é evidência de aplicação utilizável.**
