# Avaliação clínica de UX — Rodada 2

**Data:** 10/11/2026 · **Gatilho:** responsável confirmou a publicação no Lovable e pediu para prosseguir com as melhorias
**Relatório anterior:** `docs/AVALIACAO-UX-2026-11-10.md` (rodada 1, publicada no GitHub em `e9b24d9`)
**Estado:** melhorias implementadas, validadas e **versionadas no GitHub** a pedido expresso do responsável (10/11/2026). **Ainda não aplicadas ao deploy do Lovable** — isso depende de um novo rebuild no painel. O parecer técnico anterior permanece **NO-GO**.

---

## 0. Alerta de segurança encontrado no Drive (urgente, sem valores reproduzidos)

Ao consultar `Usehub.xlsx` (Google Drive) em busca de contexto de requisitos, o arquivo se revelou uma planilha de **acessos remotos de clientes com usuários e senhas em texto claro** (RDP/VPN/AnyDesk/TeamViewer, com endereços e portas). Nenhum valor foi copiado para o workspace, para este documento ou para qualquer log.

> **Ação necessária do responsável:** revogar/rotacionar todas as credenciais da planilha, restringir o compartilhamento do arquivo e migrar o controle para um cofre de segredos. Isto se soma à rotação pendente dos PATs de GitHub e da chave `anon`/JWT legada em `public/config.js`.

Este achado **não** é de UX, mas foi encontrado durante a revisão e precisa constar no registro.

---

## 1. Confirmação do deploy publicado

O rebuild do Lovable pegou o commit `e9b24d9`. Evidência coletada em 10/11/2026:

| Verificação | Resultado |
|---|---|
| `GET /` | HTTP 200, 14.174 bytes |
| Bundles | `index-rKV8Y9e-.js` + `index-C8z8cn4q.css` (novos, diferentes de `Ct64eNtI`) |
| Strings das correções nos chunks | `login-entrance`, `Sem conexão com o servidor`, `Buscar ou pesquisar`, `app:ctrlk`, aliases, `prefers-reduced-motion` — **presentes** |
| `Workflow Switcher` | **ausente** dos chunks baixados |
| `/config.js` | HTTP 200, 1.240 bytes, inalterado |

Metadados PWA ainda estavam com `apple-mobile-web-app-title="Coletor"` — corrigido nesta rodada (R2-04) e **versionado no GitHub**, mas **ainda não republicado** no deploy (depende de rebuild no painel).

---

## 2. Frentes executadas (backlog da rodada 1)

### R2-01 — S005: lançamento por teclado (pedido explícito do cliente)

A planilha "Solicitações para a USE" registra **S005 (Alta)**: *"Verificar lançamento com TAB (facilitador)"*. Medição com Chromium no ambiente isolado, abrindo os **dialogs reais** de cadastro (não as listas):

| Formulário | Labels | Pares label↔campo válidos (ANTES → DEPOIS) | `autocomplete` | `required` |
|---|---|---|---|---|
| Novo Apontamento | 4 | **0 → 3** | 0 → 1 | 0 → 2 |
| Novo Pedido de Compra | 6 | **0 → 3** | 0 | 0 |
| Terminal do Operador | 3 → 4 | **0 → 1** | 0 → 1 | 0 → 1 |

**Causa:** `<label>` HTML solto + `<Input>` sem `id` — leitor de tela não anuncia o campo, clique no rótulo não foca, `aria-describedby` não tem alvo.

**Implementado:**
- `src/shared/components/FormField.tsx` — `useId()` estável, `Label htmlFor`, `required`, `hint`, `error`, `aria-invalid`/`aria-describedby` propagados ao controle (inclusive `SelectTrigger`).
- `src/hooks/useEnterToNextField.ts` — **Enter avança** entre campos e **Shift+Enter volta**; ignora `textarea`, botões, `contenteditable` e comboboxes; no último campo mantém o comportamento nativo.
- Aplicado em `NewTimeEntryDialog.tsx`, `PurchaseOrders.tsx` (dialog de novo pedido) e `OperatorTerminal.tsx`, com dica visível de teclado para tornar o facilitador **descobrível**.

**Bug encontrado e corrigido durante o teste:** a primeira versão do hook usava `useEffect([])` + ref de objeto. Como o Radix `Dialog` monta o conteúdo em Portal somente ao abrir, o efeito rodava com `ref.current === null` e o listener nunca era registrado — medido: `Enter moved=False`. Trocado por **callback ref**, que registra no momento exato da montagem. Depois: **`Enter moved=True`** nos dois dialogs testados (`Nome do operador → próximo campo`).

### R2-02 — Auditoria completa de links do menu (backlog #2)

`scripts/ux-links-audit.mjs` extrai os **`href` de `src/config/navigation/sections/*.ts`**, complementa com os `<a href>` renderizados, faz login no isolado e **visita cada rota com Chromium**, detectando 404, área vazia e vazamento de mensagem técnica.

| | ANTES | DEPOIS |
|---|---|---|
| Rotas visitadas | 105 | 105 |
| Links quebrados (404) | **0** | **0** |
| Vazamentos técnicos | 0 | 0 |
| Tempo médio | 3.870 ms | 2.575 ms |
| `--assert` | — | ✅ **exit 0** |

Os 5 aliases da rodada 1 continuam funcionando. Uma rota (`/admin/usuarios`) é classificada como **lenta no isolado**, não quebrada: a página `Users` aguarda uma Edge Function que o harness não implementa (`404 /functions/v1/*`). Limitação do ambiente, registrada no script para não gerar falso positivo.

> **Correção de interpretação:** na rodada 1 eu havia atribuído esse breadcrumb vazio a "acesso negado silencioso". Investigação com duas identidades mostrou que (a) o perfil **admin** tem acesso e a página fica em loading por limitação do isolado; (b) o perfil **loja** já recebe "Área indisponível neste contexto" do `OperationalScopeGuard` do `MainLayout`. O `AccessDenied` desta rodada cobre apenas a lacuna entre os dois guards — **não** foi usado para justificar um defeito inexistente.

### R2-03 — Fim do empilhamento de toasts idênticos (backlog #3)

`src/hooks/use-toast.ts`: ao adicionar um aviso, remove antes o equivalente (mesmo `title` + `description` + `variant`). Mantém `TOAST_LIMIT = 5`. Quatro testes novos em `src/hooks/use-toast.test.ts` (adição, dedupe, avisos diferentes, limite).

**Ainda pendente:** Radix `Toaster` e Sonner continuam **ambos montados** em `src/App.tsx`. Unificar os provedores exige mapear todas as chamadas a `toast()` e `useToast()` — deixado para rodada futura para não quebrar feedbacks existentes.

### R2-04 — Identidade do PWA (UX-08)

`index.html`: `apple-mobile-web-app-title` de **"Coletor"** (nome de um módulo WMS) para **"USE ERP"**, e `application-name` adicionado. `canonical` (`usesistemas.com.br`) e `og:image` (genérica do Lovable) foram **mantidos**: alterá-los é decisão de marca/SEO do responsável, não correção de UX.

### R2-05 — Fallback explícito para `AccessGuard`

`src/shared/components/AccessDenied.tsx` + `src/routes/AdminRoutes.tsx`: `adminOnly`/`superOnly` agora passam um `fallback` com título, explicação e ações ("Voltar" / "Ir para o início"). Antes, `AccessGuard` usava `fallback = null` por padrão. Defesa em profundidade para quem passa no `OperationalScopeGuard` mas não tem a role exigida.

---

## 3. Validação executada

| Verificação | Resultado |
|---|---|
| `bun run e2e:public` | **8 passed** (33,1 s) |
| `bun run e2e:isolated` | **24 passed** (17,9 s) — 504 migrations + 3 seeds, `skip=0` |
| `bun run test` (vitest) | **443 passed / 95 arquivos** (rodada 1: 439/94) |
| `bun run lint:ci` | **0 errors, 0 warnings** |
| `node scripts/check-hardcoded-project-refs.mjs` (SEC-02) | **2659 arquivos / 0 referências fixas** |
| `ux-links-audit.mjs --assert` | **105 rotas, 0 quebradas, exit 0** |
| `ux-forms-audit.mjs` (antes/depois) | pares válidos 0→3 / 0→3 / 0→1; `Enter moved=True` |
| Gate anti-skip | normal **exit 0** (7 dívidas), `--strict` **exit 2** — inalterado |
| `git diff -- .github/workflows/` | **0 linhas** (18 segredos intactos) |
| `git diff --check` | **limpo** |

**Não executado:** `typecheck:app` (tsgo) — limitação conhecida do sandbox (estourou 540 s na rodada 1 e saturou a máquina, apagando temporariamente 1.149 arquivos do worktree; base restaurada antes do commit `e9b24d9`). A cobertura desta rodada é compilação real Vite + execução em browser + lint + testes.

---

## 4. Limites e o que não foi feito

- **Publicação:** a pedido expresso do responsável, as 15 alterações (8 modificadas + 7 novas) foram enviadas ao **GitHub**. **Nenhum rebuild no Lovable foi executado nesta rodada**: o deploy segue com as melhorias da **rodada 1** até o painel gerar um novo build. Repo **público** — este diagnóstico de fragilidades também passa a ser público.
- **Nenhuma alteração** em produção, banco real, migrations, grants/RLS, gate dos 18 segredos, specs, reporter ou workflows. `HOSTED_*`, `.env` versionado, `service_role`, `DATABASE_URL`, PAT e dados de cliente: **nada disso foi tocado**.
- **Sem smoke autenticado em produção, piloto ou aceite presumido.** O **NO-GO** permanece: `CI` ✅ / `Playwright autenticado` ❌ pelos 18 segredos, PATs/credenciais a rotacionar, grant sem decisão formal, fiscal/SEFAZ, PSP, restore e jornadas por clique em aberto. **CI verde não é evidência de aplicação utilizável.**
- Os scripts de auditoria usam identidades de teste do harness e bloqueiam toda origem externa; os `404/405` de Edge Functions/Realtime no isolado são limitação do ambiente.

---

## 5. Próximos passos priorizados

1. **Rebuild no Lovable** — o código já está no GitHub; falta apenas o painel gerar um novo build para o usuário final perceber esta rodada. Não autorizado nesta rodada.
2. **Unificar os provedores de toast** (Radix + Sonner) e auditar `alert()`/`window.location.reload()` remanescentes.
3. **Expandir `FormField`** para os demais formulários (`WeavingOperationsPanel`, `SectorOperationsPanels`, `OrderWizard`, `ClientFormDialog` etc.) — a medição mostrou que o padrão de `<Label>` solto é generalizado.
4. **Leitor de tela real + contraste + foco visível** em tabelas e dialogs; e jornada por **cliques** (não `page.goto`) com dados de homologação.
5. **Decisão de marca** para `canonical`/`og:image` e OG própria.
6. **S010 / S013 / S016 / S008** (lotes visuais, programação do Corte, relatório de Produção, ponto de pedido) — demanda de produto/PLM.
7. **Governança bloqueante:** 18 segredos via secret manager, rotação de todos os PATs, da chave legada e das credenciais do `Usehub.xlsx`, G-01/G-02, `--strict` verde, aceite formal.

---

## 6. Como reproduzir

```bash
cd /home/user/use-erp-implementation
bun install --frozen-lockfile && bunx playwright install chromium && bunx playwright install-deps chromium

# Terminal A — API isolada (Postgres descartável, 504 migrations + 3 seeds)
node scripts/e2e-isolated-server.mjs

# Terminal B — frontend local
VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  bun run dev -- --host 127.0.0.1 --port 4179 --strictPort

# Medições (toda origem externa abortada, config.js neutralizado)
node scripts/ux-links-audit.mjs --label=auditoria --out=/home/user/ux-evidence --assert
node scripts/ux-forms-audit.mjs --label=auditoria --out=/home/user/ux-evidence
node scripts/ux-journey.mjs      --label=auditoria --out=/home/user/ux-evidence --assert
```

Arquivos modificados: `index.html`, `package.json` (atalhos `ux:*`), `src/hooks/use-toast.ts`, `src/routes/AdminRoutes.tsx`, `src/modules/production/timeEntries/NewTimeEntryDialog.tsx`, `src/modules/production/OperatorTerminal.tsx`, `src/pages/purchasing/PurchaseOrders.tsx`, `docs/AVALIACAO-UX-2026-11-10.md` (link para esta rodada).

Arquivos criados: `docs/AVALIACAO-UX-RODADA-2-2026-11-10.md`, `scripts/ux-links-audit.mjs`, `scripts/ux-forms-audit.mjs`, `src/hooks/use-toast.test.ts`, `src/hooks/useEnterToNextField.ts`, `src/shared/components/FormField.tsx`, `src/shared/components/AccessDenied.tsx`.
