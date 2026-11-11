# Avaliação UX — Rodada 13 (11/11/2026)

> **Origem:** `"ok atualize o github e continue"`. A parte **"atualize o github"** foi consumida pelo push **`a0b66e8..6af2036`** (r11 + r12, 12 arquivos, +926/−35). O **"continue"** foi tratado como autorização de **desenvolvimento local**, não como autorização permanente de publicação nem de rebuild/deploy.
> **Frente escolhida:** item 3 do §7/r12 — **ampliar a auditoria de árvore de acessibilidade para as demais rotas**, já que `ux:aria` cobria apenas 5 diálogos de negócio. **Leitor de tela real (NVDA/VoiceOver) continua fora do escopo**: exige ambiente com leitor e áudio, não disponível neste sandbox.
> **Ferramenta:** `locator.ariaSnapshot()` — árvore de acessibilidade do **Chromium**, não escuta de leitor de tela.
> **Status:** **apenas local**, sem commit/push. `HEAD` = `origin/main` = `6af2036`. **Sem rebuild/deploy, sem dados reais, sem aceite presumido.**
> **Série de arquivos:** mantém o sufixo `2026-11-10` por coerência com as rodadas 1–12.
>
> **Atualização (publicação de 11/11/2026):** publicada no commit **`1488b3e`** (`6af2036..1488b3e`, 9 arquivos, +390/−12) a pedido expresso `"ok atualize o projeto no github, use o token …"`. CI **`43090793821` ✅ 3/3** (Typecheck, Build, lint/unit/RLS, Harness). Playwright **`43090793850`**: smoke público ✅, E2E isolado ✅, jornadas autenticadas ❌ apenas no step 4 `Validate isolated E2E configuration` (18 segredos; mesma falha já registrada). **O texto abaixo preserva o estado local do momento da execução**; a publicação não implica rebuild no Lovable nem altera o **NO-GO**.

---

## 0. Incidente de ambiente: 18ª saturação

Ao iniciar a publicação, o workspace foi resetado **novamente**: `.git`, `node_modules`, Chromium, harness e `.env.e2e.generated` desapareceram (1726 arquivos; `git rev-parse` falhou). Como r11+r12 já estavam publicadas, a recuperação partiu de um **clone raso de `6af2036`** (leitura pública, sem token) + `cp -a .git`:

| Etapa | Resultado |
|---|---|
| Inventário | **8 dos 9 arquivos** da r13 sobreviveram; faltava `src/modules/wms/Inventory.tsx` |
| Restauro | `tar` do clone + `.git` — **efeito colateral**: `--skip-old-files` foi aplicado na criação, não na extração, e os 7 arquivos modificados voltaram ao HEAD. Os 2 não versionados (audit + relatório r13) sobreviveram íntegros. |
| Reconstrução | As **7 modificações foram reaplicadas** exatamente como validadas; `Inventory.tsx` voltou do clone e recebeu os 2 `aria-label`. `git config` refeito; nenhum stale `src/shared/components/*`. |
| Reinstalação | `npm install`, harness, `playwright install chromium` + `install-deps`; deps=3, Chromium=1 |
| Revalidação | `npm test` **101/473**, `lint:ci` **0/0**, `node --test` **11/11**, `tsc` dirigido **0**, `ux:aria:routes`/`ux:aria`/`ux:names` `--assert` **3/3**, E2E **8/8 + 24/24** |

O A/B foi **refeito com o script final** após a reconstrução (§4). Nenhum número da execução anterior foi reaproveitado sem re-medição.

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-aria-routes-audit.mjs` (`npm run ux:aria:routes`) com `--assert`, `--label`, `--out` |
| Cobertura | **12 rotas do dia a dia** (as mesmas de `ux:journey`, incluindo aliases legados): dashboard, pendências, pedidos (alias + canônica), sugestão de compra, contas a receber, WMS recebimento, inventário, fiscal notas (alias) + NF-e (canônica), manual, AI config |
| Fonte | `body.ariaSnapshot()` por rota + `dialog.ariaSnapshot()` nos diálogos abertos |
| Nós medidos | `button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `slider`, `spinbutton`, `searchbox`, `switch`, `menuitem*`, `tab`, `option`, `treeitem`, `dialog`, `alert`, `status` — **694 nós interativos** |
| Diálogos | até 3 abridores por rota: heurística por nome (`Novo|Adicionar|Cadastrar|Filtrar|Filtros|Importar|Editar|Detalhes`) + `KNOWN_OPENERS` determinísticos das r11/r12 (`Novo Pedido`, `Novo Lançamento`, `Receber pluma/fibra`), **sem clicar em excluir/salvar/confirmar/exportar/sair**. Nenhum formulário foi submetido. |
| Ambiente | Chromium + API isolada QA-01 (504 migrations + 3 seeds, RLS real, só loopback), origens externas abortadas, `config.js` neutralizado |
| Evidências | `/home/user/ux-evidence/{antes,depois}-aria-routes.json` com o YAML completo de cada rota |

---

## 2. Vieses do próprio audit — corrigidos antes de aceitar números

A primeira execução apontou **17 nós sem nome** e **0 diálogos abertos**. Ambos eram artefatos do instrumento:

1. **Prefixo de papel:** o regex casava `tab` com `tablist`, `table` e `tabpanel`, e `radio` com `radiogroup` (todos os sufixos eram opcionais no regex). Corrigido com **fronteira de token** `(?=[\s:[\]"]|$)`. Isso eliminou 12 falsos positivos (`tab`/`radio`) e deixou **5 reais**.
2. **Abertura de diálogo:** `getByRole('button', { name, exact: true })` não encontrava botões cujo nome na árvore é um recorte do texto real (`"Novo Pedido"` vs `"Novo Pedido de Venda"`), e `Abrir…`/`Ver…` abriam painéis, não diálogos. Corrigido para `exact: false` + fallback por texto, lista de abridores restrita e **`KNOWN_OPENERS` determinísticos**. Na revalidação pós-saturação a cobertura oscilou para 2 diálogos e o próprio `--assert` reprovou por cobertura insuficiente (**não** por defeito de produto); em vez de relaxar o validador, ampliou-se a detecção com abridores conhecidos, retry de clique e 3 candidatos por rota. Resultado estável: **6 diálogos abertos**.

A medição viesada foi **descartada e refeita** (`antes` regravado). O `--assert` agora exige 12/12 rotas, ≥100 nós, ≥3 diálogos abertos e zero erros de rota — impede verde por HMR ou página vazia.

---

## 3. Achado: UX13-01 — filtros sem nome na árvore

| Rota | Nó | Antes | Componente |
|---|---|---|---|
| `/wms/recebimento` | `combobox` | `- combobox: Todos` | `src/modules/wms/receiving/ReceivingFilters.tsx` |
| `/wms/inventario` | 2 × `combobox` | `- combobox: Todas` / `- combobox: Todos` | `src/modules/wms/Inventory.tsx` |
| `/fiscal/notas` (alias) | `combobox` | `- combobox:` | `src/modules/fiscal/nfe/NFeFilters.tsx` |
| `/fiscal/nfe` (canônica) | `combobox` | `- combobox:` | mesmo componente reaproveitado |

**Causa raiz:** a r12 passou `labelledRef` no `SelectTrigger`, que deriva o nome de um `<label>` visível. Esses **filtros de toolbar não têm `<label>`** — só o `SelectValue` mostrando "Todos"/"Status". Sem rótulo associável, o `combobox` fica anônimo para leitor de tela, embora o `ux:labels` (que mede atributos DOM) continue verde. É o mesmo tipo de lacuna que a r12 encontrou nos diálogos, agora fora deles.

**Correção:** nomes **explícitos** nos 4 `SelectTrigger` de 3 componentes:

- `aria-label="Filtrar por status do recebimento"`
- `aria-label="Filtrar por categoria"` / `"Filtrar por status do estoque"`
- `aria-label="Filtrar por status da NF-e"`

O `deriveLabelFromDom` da r11/r12 **preserva nomes explícitos** (`aria-label` com origem diferente de `placeholder` não é sobrescrito), então não houve mudança de contrato nem enfraquecimento de gate. Nenhum `placeholder` foi promovido a nome.

---

## 4. A/B controlado

O baseline foi medido com o worktree **limpo em `6af2036`** (HEAD publicado, sem modificações de produto), antes de qualquer edição da r13 — portanto é o próprio código publicado, sem necessidade de `git checkout`.

| Estado | Rotas | Nós | Sem nome | Diálogos abertos | Diálogos sem nome | Campos/botões sem nome nos diálogos | Papeis vivos |
|---|---:|---:|---:|---:|---:|---:|---|
| **ANTES — `6af2036` publicado** | 12 | 694 | **5** | 6 | 0 | 0 | `alert`, `status` |
| **DEPOIS — r13 local** | 12 | 694 | **0** | 6 | 0 | 0 | `alert`, `status` |

```
[aria:routes] 12 rotas | nos=694 semNome=0 (campos=0 botoes=0 links=0) |
dialogosAbertos=6 semNome=0 camposSemNome=0 botoesSemNome=0 |
papeisVivos=[alert,status] | erros=0
UX ARIA ROUTES ASSERT OK: 12 rotas e dialogos acionaveis expoem nomes na
arvore de acessibilidade.
```

Nomes reais na árvore depois da correção:

```
wms-recebimento   -> combobox "Filtrar por status do recebimento"
inventario        -> combobox "Filtrar por categoria", combobox "Filtrar por status do estoque"
fiscal (2 rotas)  -> combobox "Filtrar por status da NF-e"
                     (+ 2 combobox já nomeados por rótulo visível via r12)
```

---

## 5. CI das publicações

| Run | Resultado |
|---|---|
| **`43082340701` — CI** sobre `6af2036` (r11+r12) | ✅ **3/3**: `Typecheck, lint, unitários e guardas RLS`, `Harness de banco (replay + negócio)`, `Build de produção` |
| **`43082340738` — Playwright** sobre `6af2036` | smoke público ✅, E2E isolado ✅, jornadas autenticadas ❌ **apenas** no step 4 `Validate isolated E2E configuration` (18 segredos; mesma falha r5/r6/r7–r10, **não é regressão**) |
| **`43090793821` — CI** sobre `1488b3e` (r13) | ✅ **3/3**: mesmos três jobs |
| **`43090793850` — Playwright** sobre `1488b3e` | smoke público ✅, E2E isolado ✅, jornadas autenticadas ❌ **apenas** no step 4 `Validate isolated E2E configuration` (18 segredos) |

O CI de `6af2036` **fecha a limitação declarada no §5/r12**: r11/r12 passaram a ter typecheck e build de produção validados. O CI de `1488b3e` cobre **também a r13**. **CI verde não é evidência de aplicação utilizável** — nenhuma dessas rodadas chegou ao deploy.

---

## 6. Validação local da r13

| Verificação | Resultado |
|---|---|
| `ux:* --assert` (**15/15**, incluindo `ux:aria:routes`) | ✅ todos verdes na execução original; **após a 18ª saturação**, revalidação focal `ux:aria:routes` + `ux:aria` + `ux:names` = **3/3** |
| `npm test` | **101 arquivos / 473 testes** ✅ (reexecutado após a saturação) |
| `npm run lint:ci` | **0 erros, 0 warnings** (1236 `no-explicit-any` por dívida conhecida) — reexecutado |
| `node --test scripts/e2e-isolated-lib.test.mjs` | **11/11** — reexecutado |
| `tsc` dirigido aos 8 arquivos TS alterados em r11–r13 | **exit 0** — reexecutado |
| `e2e:public` / `e2e:isolated` | **8/8** e **24/24** ✅ (servidores da publicação parados antes; reexecutados após a saturação) |
| SEC-02 | **0 referências fixas** ✅ (após restaurar `supabase/functions/mcp/index.ts`, regenerado pelo tooling) |
| Gate `validate-e2e-no-skip.mjs` | **0** / `--strict` **exit 2** pelas 7 dívidas conhecidas (esperado, não enfraquecido) |
| Segredos do workflow | **18**, `workflowDiff=0`; token real/`.git/config`/`*askpass*` = **0** |
| `git diff --check` | **0** |

**Limitações declaradas:** `npm run typecheck` completo morre por **SIGKILL/OOM** do `tsgo` neste sandbox (não é erro de tipo); o `tsc` dirigido passou. Cobertura: **12 rotas**, não todo o catálogo de rotas; **6 diálogos** abertos (até 3 abridores por rota, sem botões destrutivos). **Nenhum leitor de tela real.** Nenhum acesso à produção.

---

## 7. Higiene, segurança e estado

- Removidos: `.env.e2e.generated`, locks, `tests/harness/data*`, `e2e/test-results`, `playwright-report-isolated`, backups temporários.
- Servidores `api-isolada-publicacao-r13-*` e `erp-frontend-publicacao-r13-*` **parados**; portas 4179/54321 livres.
- O PAT usado na publicação de `6af2036` (turno anterior) foi **somente** via `GIT_ASKPASS` em `/tmp`, com script/logs apagados; **não** está em `.git/config`, workspace ou histórico. **Deve ser revogado**, junto com os PATs de r6 e 11/11 que já estavam pendentes. O PAT reenviado para esta publicação segue o mesmo tratamento.
- `git status --porcelain`: **9 arquivos locais** (7 modificados + 2 não versionados): `package.json`, 3 filtros, índice, relatórios r11/r12 atualizados, `scripts/ux-aria-routes-audit.mjs`, este relatório. **Nenhum commit, nenhum push.** *(Estado no momento da execução; publicado em `1488b3e` conforme nota no topo.)*
- `HEAD` = `origin/main` = **`6af2036`** *(antes da publicação; hoje `1488b3e`)*.

---

## 8. Próximos passos

1. **Publicar r13** — **feito** em `1488b3e` após `"ok atualize o projeto no github, use o token …"`. Não há autorização permanente: novos commits exigem novo pedido.
2. **Rebuild no Lovable pelo usuário** — única ação que leva r7–r13 ao deploy; até lá o sistema acessível continua sem cadastro de cliente (UX9-01) e com a confirmação de exclusão antiga (UX10-01).
3. **Leitor de tela real (NVDA/VoiceOver)** e ampliação da cobertura para as rotas/diálogos fora destas 12.
4. **Harness para JOINs 400**, mutações no gate de regressão, dívidas congeladas (22 alvos < 24 px, zoom 200%, viewport 320 px).
5. **Governança do NO-GO:** revogar os 3 PATs, `anon`/JWT/`Usehub.xlsx`, 18 segredos via secret manager, grant/RLS formal, fiscal/SEFAZ, PSP, restore, piloto e aceite formal.

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

npm run ux:aria:routes -- --label=depois --assert --out=/home/user/ux-evidence
npm run ux:aria        -- --label=depois --assert --out=/home/user/ux-evidence
```

---

## 10. Conclusão

A r12 provou nomes corretos nos **5 diálogos**; a r13 perguntou **e o resto do ERP?** A resposta: 12 rotas e 694 nós interativos, com **5 filtros `combobox` anônimos** que os audits de atributos DOM não viam. Corrigidos com nomes explícitos, sem tocar em `placeholder` como nome e sem enfraquecer nenhum gate: **5 → 0**.

Mais uma vez, o trabalho começou por **desconfiar do instrumento**: 17 "sem nome" eram 12 falsos positivos de prefixo de papel, e 0 diálogo aberto era falha do seletor. Só depois de corrigir o audit é que o achado real apareceu.

**`1488b3e` publicado e com CI verde 3/3; r11–r13 estão no GitHub.** O parecer técnico segue **NO-GO**, o rebuild no Lovable continua sendo do usuário e a revogação dos PATs segue pendente. **CI verde não é evidência de aplicação utilizável.**
