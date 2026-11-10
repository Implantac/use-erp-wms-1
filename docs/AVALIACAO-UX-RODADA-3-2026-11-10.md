# Avaliação clínica de UX — Rodada 3

**Data:** 10/11/2026 · **Gatilho:** responsável confirmou a publicação da rodada 2 no Lovable e pediu para continuar
**Relatórios anteriores:** [rodada 1](./AVALIACAO-UX-2026-11-10.md) (`e9b24d9`), [rodada 2](./AVALIACAO-UX-RODADA-2-2026-11-10.md) (`c794f74`)
**Estado:** melhorias implementadas, validadas e **versionadas no GitHub** a pedido expresso do responsável (10/11/2026). **Ainda não aplicadas ao deploy do Lovable** — isso depende de um novo rebuild no painel. O parecer técnico anterior permanece **NO-GO**.

---

## 1. Confirmação do deploy publicado

O rebuild do Lovable pegou `c794f74`. Baixei **os 259 chunks** referenciados pelo entry point e confirmei as strings da rodada 2:

| Verificação | Resultado |
|---|---|
| `GET /` | HTTP 200, 14.307 bytes |
| Bundles | `index-CdkxEgW3.js` + `index-C8z8cn4q.css` |
| `apple-mobile-web-app-title` / `application-name` | **`USE ERP`** (antes `Coletor`) |
| `TAB ou Enter` / `Shift+Enter volta` | **3 chunks cada** |
| `Lançamento por teclado habilitado` | 1 chunk |
| `Sem permissão para` (AccessDenied) | 1 chunk |
| `app:ctrlk`, aliases da rodada 1 | presentes |

> Metodologia: as strings de S005 vivem em **chunks lazy**, não no bundle de entrada. Conferir só o entry point daria um falso negativo — por isso baixei todos os 259.

---

## 2. Hipóteses testadas e **descartadas** (nenhuma alteração aplicada)

Uma revisão clínica honesta também registra o que **não** era defeito.

| Hipótese | Medição | Conclusão |
|---|---|---|
| "Sonner não está montado, ~171 feedbacks são silenciosos" | `src/App.tsx:111-112` renderiza **`<Toaster />` (Radix) e `<Sonner />`** | **Falsa** — meu primeiro `grep` foi incompleto. Ambos os provedores estão ativos; não unifiquei nem removi nada. |
| "Falta foco visível global, preciso adicionar `:focus-visible`" | **132 elementos** percorridos com `Tab` real em 6 rotas: **0 sem indicador (0%)** | **Falsa** — `Button`/`Input` já usam `focus-visible:ring-2`. Adicionar outline global criaria duplicidade. Registrado como **verificação**, não melhoria. |
| "`/fiscal/regras` tem botões de exclusão" | Rota correta é `/fiscal/regras-fiscais`; listas do isolado estão vazias | **Corrigido o caminho**; ausência de dados seed é limitação do ambiente, não do produto. |

---

## 3. R3-01 — Fim dos dialogs nativos do navegador

**Achado:** o projeto já possui um `ConfirmDialogProvider` global (Radix `AlertDialog`, foco gerenciado, variante destrutiva, botões traduzidos), mas **21 arquivos ainda chamavam `window.confirm` / `window.prompt`**. Resultado: a mesma ação de "Excluir" ora abria um dialog nativo bloqueante (sem rótulo, sem estilo, botões do browser, sem `Escape` previsível), ora abria o dialog acessível — dependendo da tela.

**Migração:** 15 arquivos + 1 hook (`.ts`) passaram a `useConfirm()` / `usePrompt()`, com `title`, `description`, `confirmLabel` e `variant: 'destructive'` onde a ação é irreversível. Handlers convertidos para `async`/`await`.

| Antes | Depois |
|---|---|
| 21 arquivos com `confirm`/`prompt` nativos | **0** em `.tsx` de tela; restam apenas o fallback explícito em `confirmContext.ts` |
| `confirm('Remover?')` | `await confirm({ title: 'Remover regra tributária?', description: '…', confirmLabel: 'Remover', variant: 'destructive' })` |
| `window.prompt('Justificativa…')` | `await ask({ …, inputLabel, required: true, multiline: true, confirmLabel: 'Cancelar CT-e' })` |

Telas: `ParametersTable`, `RulesList`, `UsersTable`, `TaxRules`, `Campaigns`, `ConstructionProjects`, `ConstructionProjectDetail`, `Quotations`, `PluginForm`, `HealthPatients`, `Security` (2FA), `AgroFarms`, `CycleCount`, `OrderDetailDialog`, `CTeList`, `plugin-editor/hooks.ts`.

> `usePublishVersion` (em `hooks.ts`) é **código morto** — nenhum componente o chama. Ainda assim removi seu `window.prompt`: `usePrompt()` é chamado no corpo do hook (respeitando as regras de hooks) e cancelar retorna `{ cancelled: true }`, sem publicar nem disparar `onSuccess`.

## 4. R3-02 — `usePrompt`: substituto acessível de `window.prompt`

`confirmContext.ts` ganhou `PromptCtx` / `usePrompt()`; `ConfirmDialog.tsx` passou a renderizar, além do confirm, um campo com **`FormField`** (rótulo associado, `required`, `aria-describedby`), suporte a `multiline`, foco inicial no campo via `onOpenAutoFocus` e botão de confirmação **desabilitado enquanto `required` não é satisfeito**.

Caso clínico: em `OrderDetailDialog`, a "ação corretiva obrigatória para rejeição/quarentena" era coletada por `window.prompt` — um campo sem rótulo onde `Enter` podia confirmar vazio e a tela só reclamava depois. Agora o texto é validado antes de habilitar o envio.

**Quatro testes novos** (`ConfirmDialog.test.tsx`, Testing Library + jsdom): confirmar→`true`, cancelar→`false`, campo com rótulo associado + `required` bloqueando envio vazio + texto resolvido, cancelar prompt→`null`.

## 5. R3-03 — Descrição obrigatória no `AlertDialog`

Ao rodar os testes, o Radix emitiu `Warning: Missing Description or aria-describedby for AlertDialogContent`. Não era ruído: **`opts.description` era opcional e, quando ausente, leitores de tela recebiam apenas o título**. O provider agora sempre renderiza `AlertDialogDescription`, com texto de contexto quando a tela não fornece descrição. Os 4 testes passam **sem nenhum warning**.

## 6. R3-04 — Fim do `window.location.reload()` como "Atualizar"

| Tela | Antes | Depois |
|---|---|---|
| `wms/Dashboard` | recarrega a página inteira (perde filtros/scroll) | `refetch()` já exposto por `useWMSDashboardStats` + toast de sucesso/erro + `aria-label` no botão-ícone |
| `rfid/Dashboard` | recarrega a página inteira | `refetch` novo em `useRFIDDashboard` via `invalidateQueries` nas 3 chaves + estado `Atualizando...`, ícone animado, `aria-busy` |
| `commerce/CommerceStorefrontDetail` | **ignorava o `error` do `update` e recarregava de qualquer forma** — dando a ilusão de que a flag tinha mudado | verifica `error` com toast, invalida `["storefront", id]` e `["storefronts"]`, e confirma a alteração com toast |

O terceiro caso é um **bug funcional** encontrado pela revisão de UX, não apenas cosmetic: falha silenciosa com feedback positivo falso.

> `src/main.tsx:22` mantém seu `window.location.reload()` **deliberadamente**: é o mecanismo anti-loop de *chunk load error* (com janela de 10 s em `sessionStorage`). É infraestrutura, não ação do usuário — não foi alterado.

---

## 7. Verificação com browser real

`scripts/ux-a11y-audit.mjs` (atalho `ux:a11y`) faz login no isolado, percorre **Tab de verdade** (não `.focus()` programático, que não ativa `:focus-visible`) e intercepta `window.confirm/prompt/alert` para **contar** chamadas sem alterar o produto.

| Métrica | ANTES | DEPOIS |
|---|---|---|
| Elementos amostrados com Tab | 132 (6 rotas) | 132 (6 rotas) |
| Sem indicador de foco | **0 (0%)** | **0 (0%)** — já estava correto |
| Chamadas a dialogs nativos | 0 | **0** (`confirm=0, prompt=0, alert=0`) |
| `--assert` | — | ✅ **exit 0** |

**Limitação honesta:** as listas de regras fiscais, campanhas NPS e parâmetros estão vazias no isolado, então **nenhum botão destrutivo estava disponível para ser clicado** no browser. A prova de que o `AlertDialog` abre e resolve corretamente vem dos **4 testes unitários**, não da auditoria E2E. O script registra `buttonFound=false` como informativo, não como falha — evitando um verde tautológico.

---

## 8. Validação executada

| Verificação | Resultado |
|---|---|
| `bun run e2e:public` | **8 passed** (33,6 s) |
| `bun run e2e:isolated` | **24 passed** (15,1 s) — 504 migrations + 3 seeds, `skip=0` |
| `bun run test` (vitest) | **447 passed / 96 arquivos** (rodada 2: 443/95) |
| `bun run lint:ci` | **0 errors, 0 warnings** |
| `node scripts/check-hardcoded-project-refs.mjs` (SEC-02) | **2662 arquivos / 0 referências fixas** |
| `ux:journey --assert` | ✅ 12 rotas, paleta única e Ctrl+K local |
| `ux:links --assert` | ✅ **105 rotas, 0 quebradas**, 0 vazamentos técnicos |
| `ux:a11y --assert` | ✅ 132 focos com indicador, 0 dialogs nativos |
| Gate anti-skip | normal **exit 0**, `--strict` **exit 2** — inalterado |
| `git diff -- .github/workflows/` | **0 linhas** (18 segredos intactos) |
| `git diff --check` | **limpo** |

**Incidente contornado:** ao rodar `e2e:isolated`, o build regenerou `supabase/functions/mcp/index.ts` e o SEC-02 passou a acusar ref legada. Restaurei o arquivo ao HEAD (`git checkout --`); é artefato gerado, **não** foi incluído nesta rodada. SEC-02 reexecutado: **2662/0**.

**Não executado:** `typecheck:app` (tsgo) — limitação conhecida do sandbox (estourou 540 s na rodada 1 e saturou a máquina). Cobertura: compilação real Vite + browser + lint + testes.

---

## 9. Limites e o que não foi feito

- **Publicação:** a pedido expresso do responsável, as **27 alterações** (24 modificadas + 3 novas, **0 deleções**) foram enviadas ao **GitHub**. **Nenhum rebuild no Lovable foi executado nesta rodada**: o deploy segue com as melhorias até a **rodada 2** até o painel gerar um novo build. Repo **público** — este diagnóstico de fragilidades também passa a ser público.
- **Nenhuma alteração** em produção, banco real, migrations, grants/RLS, gate dos 18 segredos, specs E2E, reporter ou workflows. `HOSTED_*`, `.env` versionado, `service_role`, `DATABASE_URL`, PAT e dados de cliente: intocados.
- **Sem smoke autenticado em produção, piloto ou aceite presumido.** O **NO-GO** permanece: `CI` ✅ / `Playwright autenticado` ❌ pelos 18 segredos, PATs e credenciais do `Usehub.xlsx` a rotacionar, grant sem decisão formal, fiscal/SEFAZ, PSP, restore e jornadas por clique em aberto. **CI verde não é evidência de aplicação utilizável.**
- Alerta de segurança da rodada 2 segue **urgente**: `Usehub.xlsx` no Drive contém acessos remotos de clientes com senhas em texto claro. Nenhum valor foi copiado para o workspace.

---

## 10. Próximos passos priorizados

1. **Rebuild no Lovable** — o código já está no GitHub; falta apenas o painel gerar um novo build para o usuário final perceber esta rodada. Não autorizado nesta rodada.
2. **Expandir `FormField`** para os demais formulários (`WeavingOperationsPanel`, `SectorOperationsPanels`, `OrderWizard`, `ClientFormDialog`, `UserDialog`) — o padrão `<Label>` solto ainda é generalizado; a rodada 2 mediu apenas 3 fluxos.
3. **Unificar provedores de toast** com auditoria de chamadas (Radix + Sonner coexistem e **ambos estão montados**; consolidar é limpeza de bundle, não correção de falha).
4. **Jornadas por cliques** (não `page.goto`) com dados de homologação, e leitor de tela real/contraste.
5. **Decisão de marca** para `canonical`/`og:image`; **S010/S013/S016/S008** (lotes visuais, programação do Corte, relatório de Produção, ponto de pedido) dependem de produto/PLM.
6. **Governança bloqueante:** 18 segredos via secret manager, rotação de todos os PATs, da chave legada e das credenciais do `Usehub.xlsx`, G-01/G-02, `--strict` verde, aceite formal.

---

## 11. Como reproduzir

```bash
cd /home/user/use-erp-implementation
bun install --frozen-lockfile && bunx playwright install chromium && bunx playwright install-deps chromium

# Terminal A — API isolada (Postgres descartável, 504 migrations + 3 seeds)
node scripts/e2e-isolated-server.mjs

# Terminal B — frontend local
VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  bun run dev -- --host 127.0.0.1 --port 4179 --strictPort

bun run ux:links  -- --label=auditoria --out=/home/user/ux-evidence --assert
bun run ux:forms  -- --label=auditoria --out=/home/user/ux-evidence
bun run ux:a11y   -- --label=auditoria --out=/home/user/ux-evidence --assert
bunx vitest run src/shared/components/ConfirmDialog.test.tsx
```

**Arquivos criados:** `docs/AVALIACAO-UX-RODADA-3-2026-11-10.md`, `scripts/ux-a11y-audit.mjs`, `src/shared/components/ConfirmDialog.test.tsx`.

**Arquivos modificados:** `src/shared/components/confirmContext.ts`, `src/shared/components/ConfirmDialog.tsx`, 16 telas/hooks migrados para `useConfirm`/`usePrompt`, 3 telas com `refetch` em vez de `reload`, `package.json` (atalho `ux:a11y`) e `docs/AVALIACAO-UX-2026-11-10.md` (índice das rodadas).
