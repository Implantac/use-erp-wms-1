# Avaliação clínica de UX — ERP publicado pelo Lovable

**Data:** 10/11/2026 · **Escopo:** sistema publicado em `https://useerp.lovable.app`, revisão ponta a ponta com foco em quem usa o ERP no dia a dia
**Método:** diagnóstico do deploy + leitura de requisitos no Google Drive + leitura de código + **teste de uso com Chromium real**
**Veredito:** melhorias implementadas, validadas e **versionadas no GitHub** a pedido expresso do responsável (10/11/2026). **Ainda não aplicadas ao deploy do Lovable** — isso depende de um rebuild no painel. O parecer técnico anterior permanece **NO-GO**.

> Este documento cobre **experiência de uso**. Ele não substitui, não altera e não revalida `docs/AVALIACAO-TECNICA-ERP-2026-11-05.md`. **CI verde não é evidência de aplicação utilizável.**
>
> **Rodada 2 (10/11/2026):** [AVALIACAO-UX-RODADA-2-2026-11-10.md](./AVALIACAO-UX-RODADA-2-2026-11-10.md) — S005 (teclado no lançamento), auditoria de 105 links do menu, dedupe de toasts e identidade PWA.
> **Rodada 3 (10/11/2026):** [AVALIACAO-UX-RODADA-3-2026-11-10.md](./AVALIACAO-UX-RODADA-3-2026-11-10.md) — unificação de dialogs de confirmação, `usePrompt` acessível e fim dos recarregamentos de página.
> **Rodada 4 (10/11/2026):** [AVALIACAO-UX-RODADA-4-2026-11-10.md](./AVALIACAO-UX-RODADA-4-2026-11-10.md) — nomes acessíveis, rótulos de campos e contraste WCAG AA (medidos com Chromium, A/B controlado).
> **Rodada 5 (10/11/2026):** [AVALIACAO-UX-RODADA-5-2026-11-10.md](./AVALIACAO-UX-RODADA-5-2026-11-10.md) — responsividade em 375/768/1440 px, cabeçalhos de tabela, controles cortados e regiões roláveis focáveis. Publicada no GitHub em `543911e`; **rebuild no Lovable a cargo do usuário, ainda pendente**.
> **Rodada 6 (10/11/2026):** [AVALIACAO-UX-RODADA-6-2026-11-10.md](./AVALIACAO-UX-RODADA-6-2026-11-10.md) — jornadas de negócio por clique: nomes acessíveis (19→0), foco no primeiro campo inválido (3→0), mensagens acionáveis e dica para botões travados (2→0). **Publicada no GitHub em `2ca213c`**; CI `42900215336` ✅, Playwright `42900215858` ❌ apenas no step 4 (18 segredos).
> **Rodada 7 (10/11/2026):** [AVALIACAO-UX-RODADA-7-2026-11-10.md](./AVALIACAO-UX-RODADA-7-2026-11-10.md) — conferência do deploy (r5/r6 presentes no bundle) e **resiliência a falhas de backend**: 4 rotas silenciosas → 0, com feedback acionável e retry globais. **Apenas local**, sem commit/push.
> **Rodada 8 (10/11/2026):** [AVALIACAO-UX-RODADA-8-2026-11-10.md](./AVALIACAO-UX-RODADA-8-2026-11-10.md) — **retentativa visível** (UX7-03): 3 rotas sem aviso → 0, latência < 800 ms, carregamento anunciado a leitores de tela. A/B com falha 503 induzida. **Apenas local**, sem commit/push.
> **Rodada 9 (10/11/2026):** [AVALIACAO-UX-RODADA-9-2026-11-10.md](./AVALIACAO-UX-RODADA-9-2026-11-10.md) — **caminho feliz real** e achado **CRÍTICO**: cadastro de cliente quebrado (`document_type` minúsculo vs. `CHECK ('CPF','CNPJ')`), invisível a 465 testes, 24 E2E e CI verde. Corrigido com A/B `400 → 201`. **Apenas local**, sem commit/push.
> **Rodada 10 (10/11/2026):** [AVALIACAO-UX-RODADA-10-2026-11-10.md](./AVALIACAO-UX-RODADA-10-2026-11-10.md) — **ciclo completo** `POST 201 → PATCH 200 → DELETE 200`; correção da confirmação destrutiva que fechava antes do resultado e do vazamento de rota interna. Inclui a **14ª saturação** e a reconstrução fiel do lote. Extensão `DELETE` no **servidor isolado** (SQL real sob RLS), não em produção. **Apenas local**, sem commit/push.
>
> **Estado atual (publicação de 11/11/2026):** r1–r6 **confirmadas no deploy publicado** (402 chunks conferidos). **r7, r8, r9 e r10 publicadas no GitHub** em `3ea59aa` (26 arquivos, +2005/−19; `f49857f..3ea59aa`). CI `43061672688` ✅ **3/3** (Typecheck, Build, lint/unit/RLS, Harness); Playwright `43061672621` com **E2E isolado ✅** e smoke público ainda em execução no momento da conferência.
>
> **Ainda não implantadas:** r7–r10 exigem **rebuild no Lovable pelo usuário**. Até lá, o deploy acessível continua sem cadastro de cliente (UX9-01) e com a confirmação de exclusão fechando antes do resultado (UX10-01). O parecer técnico segue **NO-GO**. **CI verde não é evidência de aplicação utilizável.**
>
> Este relatório da rodada 1 fica preservado como histórico.

---

## 1. Como o diagnóstico foi feito (e o que ele **não** prova)

| Fonte | O que foi feito | Limite declarado |
|---|---|---|
| Deploy publicado | `GET /`, `/login`, `/config.js` e rota SPA → **HTTP 200**; HTML de 14.174 bytes, bundle `index-Ct64eNtI.js`, CSS `index-CngLhpDS.css` | HTTP 200 prova que a tela existe; **não** prova autenticação, RLS nem fluxo de negócio. Nenhum dado real foi acessado. |
| Google Drive | Lidas a planilha **"Solicitações para a USE"** (S001–S016, com status/prioridade/impedimentos), o PDF **"ERP_Prompt_Completo_com_Cores"** (módulos, perfis, paleta `#1a2234`/`#ff9800`) e o inventário da pasta **Treinamentos UseCloud** | Vídeos de treinamento **não** foram assistidos; a planilha é o registro de dores do cliente, não aceite formal. |
| Código | 699 `.tsx` em `src/`; rotas, guards, login, layout, paleta de comando, componentes compartilhados | Leitura estática isolada não demonstra dificuldade de uso — por isso houve teste com browser. |
| **Browser real** | Chromium 151 (Playwright) navegando num **frontend Vite local**, com `config.js` substituído em voo e **toda origem externa abortada** | Nenhuma credencial de produção, nenhum dado de cliente, nenhum deploy. |
| **Jornada autenticada** | Login e 12 rotas contra o **ambiente isolado QA-01** (Postgres embarcado, 504 migrations + 3 seeds, RLS real, somente `127.0.0.1`) | O isolado **não** implementa Edge Functions, Realtime nem todos os métodos REST: os `404 /functions/v1/*`, `405 /rest/v1/*` e o WebSocket 404 registrados nos logs são **limitação do harness**, não defeito do produto. |

**Credenciais:** apenas as identidades de teste que o próprio harness gera em `.env.e2e.generated` (arquivo ignorado pelo Git, descartado ao fim). O `config.js` publicado foi neutralizado em todas as execuções de browser.

**Não foi testado:** autenticação/RLS em produção, fiscal/SEFAZ, PSP, restore, jornadas por clique com dados reais, leitor de tela real, touch em chão de fábrica, aceite formal. O Playwright autenticado em produção continua ❌ pelos **18 segredos** do gate.

---

## 2. A voz do cliente (Drive) que orientou a revisão

A planilha "Solicitações para a USE" registra dores que são **exatamente** de usabilidade operacional:

- **S005 (Alta, "Em análise")** — *"Verificar lançamento com TAB (facilitador)"*: o cliente pede navegação por teclado no lançamento de dados.
- **S010 / S013 / S016** — lotes visuais e ficha técnica digital, programação semanal do Corte, relatório de acompanhamento de Produção.
- **S008 (Crítica, "Andamento")** — ponto de pedido para produção e compra de tecido.
- **S001 / S003 / S007** — marcadas "Concluído" pelo cliente (datas invertidas, relatório → dashboard, estoque máximo/curva ABC). Não revalidadas nesta rodada.
- **S006 / S012 / S015** — bloqueadas/canceladas pelo próprio cliente; **não** reabertas.

O PDF de requisitos define o sistema como *"responsivo, amigável e escalável, com foco em usabilidade"*, com perfis por módulo e fluxo de venda integrado. É contra esse padrão que os achados abaixo foram classificados.

---

## 3. Achados clínicos (medidos, não opinados)

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX-01** | **Crítica** | **4 URLs divulgadas retornavam 404 dentro do app**: `/comercial/pedidos/novo`, `/fiscal/notas`, `/financeiro/contas-receber`, `/compras/sugestoes`. Eram destinos do próprio launchpad do sistema e URLs típicas de favorito/treinamento. O usuário ficava ~**30 s** até desistir do carregamento. | `antes-journey.json`: 4 rotas `404=True`, `timedOut=True`, 30.302 / 30.336 / 31.071 / 31.117 ms; screenshot `antes-novo-pedido.png` |
| **UX-02** | **Alta** | **Dois launchpads concorrentes.** O `WorkflowSwitcher` legado ficava fixo no canto inferior direito **até na tela de login**, em inglês, com atalho de Mac `⌘K` (usuário de ERP costuma estar no Windows). Era o **primeiro foco do TAB**. Dos seus 9 destinos, 4 davam 404. O Ctrl+K abria a `CommandPalette` (paleta correta, em PT-BR), mas clicar no botão abria **outra** paleta, com destinos diferentes. | `antes-metrics.json`: `firstTab = "Workflow Switcher⌘K"`; `antes-journey.json`: `floatingSwitcherVisible=true`, `dialogCount=1`, `legacyDialogItems` com 9 itens |
| **UX-03** | **Alta** | **Login podia ficar invisível.** `opacity: 0` inline no container, logo, título e card; a visibilidade dependia exclusivamente de uma animação CSS com `forwards`. Com animação desligada (CSS bloqueado, extensão, `prefers-reduced-motion`), **card/container/título = `opacity: 0`**. Não havia regra global de movimento reduzido. | `antes-metrics.json`: `visual.card.opacity=0`, `container=0`, `title=0`; `emailInput=1` (formulário "fantasma") |
| **UX-04** | **Alta** | **Sem suporte a gestor de senhas nem a leitores de tela no login**: `autocomplete=null`, `required=false`, `aria-invalid=null`, `aria-describedby=null`, sem foco inicial. Para quem entra todo dia no ERP, é atrito diário — e contradiz S005. | `antes-metrics.json`: `attrs.email/password` todos nulos/false |
| **UX-05** | **Alta** | **Erro sem ação.** Submit vazio focava no **botão**, marcava **0** campos como inválidos e mostrava só um toast genérico `"Preencha todos os campos"`. Falha de rede vazava **`Failed to fetch`** em inglês. Toasts de erro **empilhavam** e cobriam a interface (dois sistemas de toast montados: Radix + Sonner). | `antes-metrics.json`: `focusedAfterError="BUTTON"`, `invalidFields=0`; `errorText` contém `Failed to fetch`; screenshot `antes-login-desktop.png` |
| **UX-06** | Média | `setIsLoading(false)` **fora de `finally`** nas três ações do login: uma exceção no `catch` travaria o botão em "Entrando..." permanentemente. | `src/pages/Login.tsx` (versão `d80caa6`) |
| **UX-07** | Média | **Promessa quebrada de atalho.** O Manual do Sistema anuncia `"…(Ctrl+K)"` no placeholder e o Brain também trata Ctrl+K, mas a `CommandPalette` escuta em **capture phase** com `stopPropagation()`: os listeners locais **nunca** disparavam. O usuário pedia busca local e recebia a paleta global. O placeholder da paleta também não casava com a regressão `.lovable/e2e/cmdk.spec.ts` (`/buscar|pesquisar/i`). | `CommandPalette.tsx` (capture + stopPropagation), `SystemManual.tsx:29`, `Brain.tsx:47` |
| **UX-08** | Média | **Identidade inconsistente no PWA/metadados**: `apple-mobile-web-app-title = "Coletor"` num ERP, `<meta>` vazio, `canonical` apontando para `usesistemas.com.br`, `og:image` genérica do Lovable. Afeta confiança e o nome ao instalar no celular/coletor. | `index.html` do deploy (10/11/2026) |
| **UX-09** | Média | **Sem `prefers-reduced-motion: reduce` global** — apenas um `@media (prefers-reduced-motion: no-preference)` para o logo em `App.css`. Usuários com necessidade de acessibilidade recebiam todas as animações. | varredura de `src/**/*.css` |

**Ponto positivo medido:** o login no ambiente isolado funcionou (2,3 s), o layout responsivo **não** teve overflow horizontal em 375×667, e o Manual do Sistema carregou 13.228 caracteres de conteúdo em 3,7 s. O problema não é "o sistema não abre", é **o caminho até a tarefa estar cheio de armadilhas**.

---

## 4. Melhorias implementadas

### 4.1 Rotas quebradas → aliases de compatibilidade
`src/routes/index.tsx`: estendido o `legacyAliasMap` **já existente** (padrão do próprio projeto) e registradas 5 rotas de compatibilidade. Preservam `search` e redirecionam para a rota canônica:

| URL antiga (404) | Destino canônico |
|---|---|
| `/comercial/pedidos/novo` | `/comercial/pedidos` |
| `/fiscal/notas` | `/fiscal/nfe` |
| `/financeiro/contas-receber` | `/financeiro/receber` |
| `/compras/sugestoes` | `/compras/dashboard` |
| `/admin/ai-config` | `/executive/brain` |

### 4.2 Um único ponto de busca
- `src/App.tsx`: **desmontado** o `WorkflowSwitcher` global (mantido o arquivo, com aviso explícito de descontinuação em `src/modules/core/components/WorkflowSwitcher.tsx`, para não reintroduzir).
- `src/core/layout/CommandPalette.tsx`: placeholder agora **"Buscar ou pesquisar…"** (claro e compatível com a regressão Cmd/Ctrl+K) e **delegação por evento cancelável** `app:ctrlk`.
- `src/modules/admin/systemManual/SystemManual.tsx` e `src/pages/executive/Brain.tsx`: trocados os listeners de teclado inalcançáveis por handlers do evento `app:ctrlk`. **Ctrl+K passa a focar a busca local** nessas telas; nas demais, abre a paleta global.

### 4.3 Login que orienta em vez de culpar
`src/pages/Login.tsx` (reescrito, preservando todos os seletores dos testes existentes):
- **Visibilidade por padrão**: removidos os `opacity: 0` inline; animações viraram *enhancement* via classes em `src/index.css`, aplicadas só sob `@media (prefers-reduced-motion: no-preference)`; **regra global de `reduce`** adicionada.
- `autoComplete` (`username` / `current-password` / `new-password` / `email` / `name`), `required`, `inputMode`, `autoCapitalize`, `spellCheck`, `autoFocus` e `<form noValidate>`.
- **Validação por campo** com `aria-invalid`, `aria-describedby`, `role="alert"`, mensagens específicas em PT-BR e **foco automático no primeiro campo inválido**.
- `friendlyAuthError()` em `src/lib/errors.ts`: traduz falha de rede, credenciais inválidas, email não confirmado e rate limit; **nunca** devolve SQL/RLS/JWT/stack ao usuário.
- `finally` em todas as submissões, guarda contra duplo submit, erros **inline** no card em vez de toasts empilhados.

### 4.4 Regressão automatizada
- `e2e/public/login.spec.ts`: **+5 testes** (gestor de senhas/ARIA, submit vazio com foco, erro traduzido, visibilidade sem animação, ausência do launchpad).
- `package.json`: script **`e2e:public`** para a suíte sem backend.
- `scripts/ux-audit.mjs`: medidor de UX do login (foco, ordem TAB, ARIA, `reduced-motion`, mobile, tempo de feedback).
- `scripts/ux-journey.mjs`: jornada autenticada de 12 rotas com **`--assert`** (falha se houver 404/timeout, launchpad visível, mais de um diálogo no Ctrl+K ou busca local ignorada).

---

## 5. Antes × Depois (números reais)

| Métrica | ANTES | DEPOIS |
|---|---|---|
| Rotas com 404 (de 9 testadas) | **4** | **0** (12 rotas testadas, 5 aliases + canônicas) |
| Tempo nas rotas quebradas | 30,3 s / 30,3 s / 31,1 s / 31,1 s | 2,5 s / 1,2 s / 1,4 s / 1,5 s (redirect) |
| `opacity` do card com animação desligada | **0** | **1** |
| `opacity` com `prefers-reduced-motion: reduce` | sem suporte | **1** (container, título, card, input) |
| Primeiro foco / primeiro TAB | corpo → **"Workflow Switcher ⌘K"** | **`#email`** → "Esqueceu a senha?" |
| `autocomplete` email / senha | `null` / `null` | `username` / `current-password` |
| `required` | `false` | `true` |
| Submit vazio: foco / campos inválidos / alertas | `BUTTON` / **0** / 2 | **`email`** / **2** / 3 ("Informe seu email.", "Informe sua senha.") |
| Mensagem de erro de rede | `Failed to fetch` | "Sem conexão com o servidor. Verifique sua internet e tente novamente." |
| Feedback de erro | 92 ms | 48 ms |
| Launchpad legado visível | **sim** (inclusive no login) | **não** |
| Ctrl+K no Manual | abria paleta global | **foca** `Buscar módulo… (Ctrl+K)`, sem diálogo global |
| Overflow horizontal em 375 px | não | não |

`ux-journey.mjs --assert` → **exit 0**: login, 12 rotas, paleta única e Ctrl+K local verificados.

---

## 6. Validação executada

| Verificação | Resultado |
|---|---|
| `bun run e2e:public` | **8 passed** (23,7 s) — inclui os 3 testes antigos + 5 novos |
| `bun run e2e:isolated` | **24 passed** (8,6 s) — 504 migrations + 3 seeds, RLS real, `skip=0` |
| `bun run test` (vitest) | **439 passed / 94 arquivos** |
| `node --test` (validadores) | **34 passed / 0 fail** |
| `bun run lint:ci` | **0 errors, 0 warnings** |
| `node scripts/check-hardcoded-project-refs.mjs` (SEC-02) | **2653 arquivos / 0 referências fixas** (reexecutado após a inclusão deste relatório) |
| Gate anti-skip `validate-e2e-no-skip.mjs` | normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (inalterado, por desenho) |
| `git diff -- .github/workflows/e2e.yml` | **0 linhas** (18 segredos intactos) |
| `git diff --check` | **limpo** |
| Compilação Vite + execução em browser | todos os módulos alterados carregaram e executaram sem erro de runtime |

**Limitação conhecida:** `bun run typecheck:app` (tsgo) excedeu 540 s no sandbox e foi encerrado por timeout — comportamento já registrado em rodadas anteriores (OOM/lentidão), **não** é regressão desta entrega. A validação de tipos não foi concluída; a cobertura desta rodada é a compilação real Vite + lint + testes + navegação. Após a normalização do sandbox, o SEC-02 e o `git diff --check` foram **reexecutados com sucesso** sobre o estado final, já incluindo este documento.

---

## 7. O que **não** foi feito (e por quê)

- **Publicação:** a pedido expresso do responsável, as alterações foram enviadas ao **GitHub** (11 arquivos modificados + este relatório e 2 scripts novos). **Nenhum rebuild no Lovable foi executado**: o deploy em `useerp.lovable.app` segue com o comportamento "ANTES" até o painel gerar um novo build. Repo **público** — este diagnóstico de fragilidades também passa a ser público.
- **Nenhuma alteração em produção, banco real, migrations, grants ou RLS**; nenhum dado de cliente; nenhuma credencial real; nenhum segredo, PAT, `.env` versionado, `service_role`, `DATABASE_URL` ou `HOSTED_*` em `src/`.
- **Gate dos 18 segredos, `E2E_REQUIRE_ALL='1'`, specs, reporter e workflows intactos.** G-01/G-02 **não** corrigidos. `--strict` continua `exit 2`.
- **Sem smoke autenticado em produção, piloto ou aceite presumido.** O **NO-GO** do parecer técnico permanece: `CI` ✅ / `Playwright autenticado` ❌ (18 segredos), PATs e `anon`/JWT legado ainda a rotacionar/revogar, decisão formal do grant pendente.
- **UX-08 (identidade PWA/metadados) não foi alterado**: mexe em SEO/canonical/OG do deploy publicado e exige decisão de marca do responsável.
- **Pendência documental antiga, ainda aberta:** cabeçalhos `09/11/2026` e textos de QA-07 `07/11/2026` divergem da data corrente; não corrigida nesta rodada por estar fora do escopo de UX.

---

## 8. Backlog priorizado (próximos passos de produto)

1. **S005 — teclado no lançamento (Alta, pedido explícito do cliente).** O login agora é exemplar, mas os **formulários de PCP/passagem/ocorrência** precisam da mesma auditoria: ordem de TAB, `Enter` → próximo campo, `autoComplete`, `required`, foco no erro e atalhos documentados. Exige telas com dados de homologação para ser válido.
2. **Auditoria de links inteira.** Os 5 aliases cobrem as URLs que apareceram no launchpad e na jornada; ainda há centenas de rotas e itens de menu. Recomenda-se rastrear todos os `href` contra o roteador num teste estático e repetir a jornada por cliques (não por `page.goto`).
3. **Unificar o sistema de notificações.** Radix `Toaster` e Sonner estão montados simultaneamente; definir um único provedor, com dedupe e limite, evita o empilhamento visto no screenshot `antes-login-desktop.png`.
4. **Acessibilidade ponta a ponta.** `prefers-reduced-motion` global já existe; falta auditoria com leitor de tela real, contraste e foco visível em tabelas/dialogs.
5. **S010 / S013 / S016 / S008** (lotes visuais, programação do Corte, relatório de Produção, ponto de pedido) — demanda de produto/PLM, não correção de UX; registrar decisão antes de implementar.
6. **UX-08** — alinhar `apple-mobile-web-app-title`, canonical e OG image com a marca USE Sistemas.
7. **Governança (fora de UX, mas bloqueante):** 18 segredos via secret manager, rotação/revogação de todos os PATs e da chave legada, G-01/G-02, `--strict` verde, jornadas por clique, fiscal/SEFAZ, PSP, restore e aceite formal com commit/ambiente/data/responsável.

---

## 9. Como reproduzir

Evidências (JSON + screenshots antes/depois) em **`/home/user/ux-evidence/`**, fora do repositório.

```bash
cd /home/user/use-erp-implementation
bun install --frozen-lockfile
bunx playwright install chromium          # + install-deps, se faltarem libs

# Suíte de regressão sem backend (sobe o próprio Vite em 127.0.0.1:4179):
bun run e2e:public

# Jornada autenticada (2 terminais):
node scripts/e2e-isolated-server.mjs                       # API isolada :54321
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  bun run dev -- --host 127.0.0.1 --port 4179 --strictPort

node scripts/ux-audit.mjs   --label=auditoria --out=/home/user/ux-evidence
node scripts/ux-journey.mjs --label=auditoria --out=/home/user/ux-evidence --assert
```

Os dois scripts **abortam toda origem externa** e substituem o `config.js` por um apontamento inerte/isolado. Nenhum deles fala com Supabase ou Lovable reais.

---

## 10. Conclusão

O sistema **abre e autentica** no ambiente isolado, mas o caminho do usuário até a tarefa estava degradado por links mortos, dois launchpads concorrentes, uma tela de login que podia ficar invisível e erros que não diziam o que fazer. As correções desta rodada são cirúrgicas, medidas e cobertas por regressão automatizada — **sem tocar em segurança, banco, gate ou produção**.

O código já está no GitHub. Para que o usuário final perceba a melhoria no sistema publicado pelo Lovable, falta **um rebuild no painel** (não autorizado nesta rodada). Até lá, o deploy permanece com o comportamento "ANTES" e o status geral do projeto continua **NO-GO**.
