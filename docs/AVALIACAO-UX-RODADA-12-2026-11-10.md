# Avaliação UX — Rodada 12 (11/11/2026)

> **Origem:** `"ok prossiga"` após o relatório da r11. Frente escolhida na limitação declarada do §8/r11: **validar o que o Chromium realmente expõe a um leitor de tela**, em vez de medir apenas atributos do DOM.
> **Ferramenta:** `locator.ariaSnapshot()` (Playwright/CDP Accessibility Tree). **Isto NÃO é uma escuta com NVDA/VoiceOver** — é a árvore de acessibilidade do Chromium que esses leitores consomem. A limitação de leitor de tela real **permanece**.
> **Status:** **apenas local**. Sem commit/push. `origin/main` segue em `a0b66e8` (r7–r10 publicadas). **Sem rebuild/deploy** — rebuild no Lovable, smoke autenticado em produção e revogação dos PATs continuam sendo ações do usuário, não autorizadas por `"ok prossiga"`.
> **Série de arquivos:** mantém o sufixo `2026-11-10` por coerência com as rodadas 1–11.
>
> **Atualização (publicação de 11/11/2026):** publicada junto com a r11 no commit **`6af2036`** (`a0b66e8..6af2036`), a pedido expresso `"ok atualize o github e continue"`. CI **`43082340701` ✅ 3/3** (Typecheck, Build, lint/unit/RLS, Harness) — **fecha a limitação de typecheck/build declarada no §5**. Playwright **`43082340738`**: smoke público ✅, E2E isolado ✅, jornadas autenticadas ❌ apenas no step 4 `Validate isolated E2E configuration` (18 segredos). **O texto abaixo preserva o estado local do momento da execução**; a publicação não implica rebuild no Lovable nem altera o **NO-GO**. A r13, feita depois, foi publicada em `1488b3e` com CI `43090793821` ✅ 3/3.

---

## 0. Incidente de ambiente: 17ª saturação e restauro parcial

Antes de qualquer execução da r12, o workspace foi resetado **novamente**: `.git`, `node_modules`, Chromium, harness e `.env.e2e.generated` desapareceram (1722 arquivos), e o `git rev-parse` falhou. O clone raso `/tmp/ux13-reclone` de `a0b66e8` restaurou o HEAD, mas **`tar --skip-old-files` preservou apenas 4 dos 7 arquivos da r11**:

| Arquivo r11 | Estado após saturação |
|---|---|
| `docs/AVALIACAO-UX-2026-11-10.md` (índice), `package.json` (`ux:names`), `docs/AVALIACAO-UX-RODADA-11-2026-11-10.md`, `scripts/ux-names-audit.mjs` | **sobreviveram** |
| `src/ui/base/input.tsx`, `src/ui/base/labelledRef.ts` | voltaram ao HEAD **pré-r11** |
| `src/ui/base/labelledRef.test.ts` | **ausente** |

Consequência metodológica: **a correção r11 precisou ser reaplicada antes de qualquer medição**, senão o A/B compararia HEAD publicado com HEAD publicado. Os 3 arquivos foram reconstruídos, 7 `src/shared/components/*` stale foram descartados com `git checkout --`, `git config` refeito e o ambiente reinstalado (`npm install`, harness, `playwright install chromium`, `install-deps`). `ariaSnapshot()` foi verificado num fixture mínimo antes de escrever o audit:

```
- main:
  - heading "Ola" [level=1]
  - text: CEP *
  - textbox "CEP *":
    - /placeholder: 00000-000
  - button "Salvar"
  - alert: Falhou
```

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-aria-audit.mjs` (`npm run ux:aria`) com `--assert`, `--label`, `--out` |
| Fonte do nome | **`ariaSnapshot()` de cada nó de campo** — papel + nome na árvore de acessibilidade, não `getAttribute('aria-label')` |
| Cobertura | **5 diálogos × todas as abas**, **56 nós de campo** (contra 42 da r11: aqui entram também `button[role=combobox]` do Radix e inputs com `id`) |
| Classificação | `semNome`, `nome=placeholder`, `arvore!=aria-label`, botões/diálogos sem nome, `role=alert`/`role=status` na árvore global |
| Ambiente | Chromium + API isolada QA-01 (504 migrations + 3 seeds, RLS real, só loopback), origens externas abortadas, `config.js` neutralizado |
| Evidências | `/home/user/ux-evidence/{antes-ab-head,antes,depois}-aria.json` com o YAML completo de cada diálogo/aba |

**Por que ler o `placeholder` no DOM?** Quando o placeholder é promovido a nome acessível, o Playwright **deixa de emitir** a linha `/placeholder:` no YAML. Comparar nome apenas com essa linha daria falso verde. O `placeholder` é lido no DOM **só para classificar** o nome que veio da árvore; a origem do nome permanece sendo `ariaSnapshot()`.

### 1.1 Vieses da própria medição — corrigidos e evidências refeitas

A primeira versão do audit estava **errada** e foi descartada (nenhum número dela é usado aqui):

1. O parser exigia `:` depois do nome, mas o YAML omite `:` em nós sem filhos (`- textbox "Razão Social *"`). Isso fez o HEAD parecer ter 18 campos em vez de 25.
2. O Playwright entre-aspas escalares com caracteres YAML: `- 'textbox "Ex: Sul, Sudeste..."'`. Sem normalizar, 2 campos perdiam o papel.
3. Nomes iguais ao placeholder não podiam ser detectados pela linha `/placeholder:`, pela razão acima.

Correções: dois-pontos opcional, `unquote()` para escalares YAML, snapshot **por nó** de campo, e validadores de cenário no `--assert` (`>=35` campos, 5/5 diálogos, zero erros de jornada) para impedir verde por HMR ou falha de abertura. **Os 5 JSON da medição viesada foram removidos** e o A/B foi refeito do zero.

---

## 2. Achados

| ID | Achado | Causa raiz | Evidência na árvore |
|---|---|---|---|
| **Confirmação r11** | 8 campos anunciados pelo placeholder no HEAD (`00000-000`, `(00) 0000-0000`, `Ex: Sul, Sudeste...`, `ISENTO ou número`, `Nome do fornecedor`…) | r4 deriva `aria-label` do placeholder; r6 não sobrescreve nomes | HEAD `nome=placeholder=8` → com r11 `1` |
| **UX12-01** | **10 `combobox` sem nome** (Status, UF, Região, fornecedor etc.) | `src/ui/base/select.tsx` montava `SelectPrimitive.Trigger` **sem `labelledRef`**; o `ux:names` da r11 só cobria `input`/`textarea`/`select` nativos, e o `ux:task` considera qualquer `aria-label` como nomeado | `- combobox: Ativo` (sem nome) |
| **UX12-02** | **1 diálogo sem nome** no wizard de pedido de venda | `src/modules/commercial/Orders.tsx:241` monta `DialogContent` com `OrderWizard`, **sem `DialogTitle`**; o `DialogContent` base só gera descrição oculta | `- dialog:` na árvore global |
| **UX12-03** | **1 campo ainda anunciado pelo placeholder** após a r11 | `FiberReceiptDialog.tsx`: o `<Label>Fornecedor *</Label>` nomeia o `Select`; o input manual de fornecedor vem **depois de outro controle**, e a guarda da r11 (`controls.length<=1`) corretamente impede herdar rótulo de campo vizinho. Faltava um rótulo próprio. | `textbox "Nome do fornecedor"` |

O achado UX12-03 é importante: a r11 mediu **42 campos via DOM** e declarou `placeholderComoNome=0`. A árvore de acessibilidade, com cobertura maior, mostrou que **um caso estrutural escapou**. Não é erro da correção r11 — é limite da cobertura do audit dela.

---

## 3. Correções (apenas locais)

| Arquivo | Mudança |
|---|---|
| `src/ui/base/select.tsx` | `SelectTrigger` agora usa `labelledRef(ref)`, reaproveitando a derivação de rótulo visível da r11 |
| `src/ui/base/labelledRef.ts` | `id` isolado **não** é mais tratado como associação: só `label[for=id]` ou `aria-labelledby` bloqueiam a derivação. Radix gera `id` internos (`radix-:r1:`) que não apontam para rótulo algum. |
| `src/modules/commercial/Orders.tsx` | `<DialogTitle className="sr-only">Novo Pedido de Venda</DialogTitle>` no `DialogContent` do wizard |
| `src/modules/wms/FiberReceiptDialog.tsx` | rótulo visível próprio + associação nativa `label[for]`/`id` para o campo manual de fornecedor (o `placeholder` deixa de ser o nome) |
| `src/ui/base/labelledRef.test.ts` | +1 teste de regressão para `id` interno do Radix → **7 testes** |
| `scripts/ux-aria-audit.mjs`, `package.json` (`ux:aria`) | novo audit de árvore de acessibilidade |
| `src/ui/base/input.tsx`, `src/ui/base/labelledRef.ts` | **reaplicação da r11** perdida na 17ª saturação (`data-ux-label-source`, `deriveLabelFromDom`, `MAX_ASCENT=2`, guarda contra campo vizinho) |

Precedência mantida: `aria-label` explícito > `aria-labelledby`/`label[for]`/`FormField` > rótulo visível > placeholder. **Nomes explícitos continuam intocáveis**; só a origem `placeholder` cede ao rótulo visível.

---

## 4. A/B controlado (mesmo build, mesmas 5 jornadas)

Os controles foram feitos com `git checkout --` apenas nos **5 arquivos de produto**, mantendo o audit e o `ux:aria` constantes. Vite recebeu 4 s de HMR entre cada estado.

| Estado | Campos | Sem nome | Nome = placeholder | Árvore ≠ DOM | Botões sem nome | Diálogos sem nome | Papeis vivos |
|---|---:|---:|---:|---:|---:|---:|---|
| **A — HEAD publicado `a0b66e8`** (sem r11, sem r12) | 56 | **10** | **8** | 0 | 0 | **1** | `alert`, `status` |
| **B — início da r12** (r11 aplicada, sem r12) | 56 | **10** | **1** | 0 | 0 | **1** | `alert`, `status` |
| **C — r11 + r12** | 56 | **0** | **0** | 0 | 0 | **0** | `alert`, `status` |

```
[aria] 5 jornadas | campos=56 semNome=0 nome=placeholder=0 arvore!=DOM=0 |
botoes=32 semNome=0 | dialogos=5 semNome=0 | papeisVivos=[alert,status] | erros=0
UX ARIA ASSERT OK: arvore de acessibilidade expoe nomes fieis aos rotulos,
campos/botoes/dialogos nomeados e os papeis vivos das rodadas 7/8.
```

Exemplo real do antes/depois na aba *Identificação* de *Novo Cliente*:

```
ANTES  - textbox "00.000.000/0000-00"        DEPOIS - textbox "CNPJ *":
                                                     - /placeholder: 00.000.000/0000-00
ANTES  - combobox: Ativo                     DEPOIS - combobox "Status": Ativo
ANTES  - dialog:                            DEPOIS - dialog "Novo Pedido de Venda":
```

O `alert` (r7) e o `status` (r8) aparecem na árvore global — ou seja, os papeis vivos das rodadas anteriores sobrevivem à troca de método de medição.

---

## 5. Validação

| Verificação | Resultado |
|---|---|
| `ux:* --assert` (**14/14**, incluindo o novo `ux:aria`) | ✅ todos verdes, sem relaxar nenhum gate |
| `npx vitest run src/ui/base/labelledRef.test.ts` | **7/7** |
| `npm test` | **101 arquivos / 473 testes** ✅ (r11: 101/472) |
| `node --test scripts/e2e-isolated-lib.test.mjs` | **11/11** |
| `npm run lint:ci` | **0 erros, 0 warnings** (1236 `no-explicit-any` ignorados por dívida conhecida) |
| `e2e:public` / `e2e:isolated` | **8/8** e **24/24** ✅, com servidores próprios e teardown limpo |
| SEC-02 (`check-hardcoded-project-refs.mjs`) | **2689 arquivos / 0 referências** ✅ (após `git checkout -- supabase/functions/mcp/index.ts`, regenerado pelo `npm install` e restaurado) |
| Gate `validate-e2e-no-skip.mjs` | **0** / `--strict` **exit 2** pelas **7 dívidas conhecidas** (comportamento esperado, não enfraquecido) |
| Segredos do workflow | **18**, `workflowDiff=0`; token real = **0**, `.git/config`/`*askpass*` = **0** |
| `git diff --check` | **0** |
| `tsc` dirigido aos 5 arquivos alterados | **exit 0** |

**Limitações locais (declaradas, não ocultadas):** `npm run typecheck` completo foi morto por **SIGKILL/OOM** do `tsgo` neste sandbox (não é erro de tipo); o `tsc` dirigido aos arquivos alterados passou. **Não havia CI nem build de produção sobre r11/r12 no momento desta execução** — o CI `43061672688 ✅` cobria apenas r7–r10; a limitação foi fechada por `43082340701 ✅` após a publicação (ver nota no topo). **Nenhum leitor de tela real** foi executado.

---

## 6. Higiene e estado do worktree

Removidos após as medições: `.env.e2e.generated`, `package-lock.json`, `tests/harness/package-lock.json`, `tests/harness/data*`, `e2e/test-results`, `playwright-report-isolated`, `/tmp/ux13-ab` e os 5 JSON da medição viesada. Servidores `api-isolada-rodada-12-*` e `erp-frontend-rodada-12-*` **parados**; portas 4179/54321 livres.

`git status --porcelain` = **12 arquivos**: 7 modificados + 5 não versionados (r11: relatório, `ux-names-audit.mjs`, `labelledRef.test.ts`; r12: relatório, `ux-aria-audit.mjs`). **Nenhum commit, nenhum push.** `HEAD` = `origin/main` = `a0b66e8`. *(Estado no momento da execução; publicado em `6af2036` conforme nota no topo.)*

---

## 7. Próximos passos

1. **Publicação pontual**, se e quando o usuário pedir (`"Atualize o github"`), para que r7–r12 entrem no CI; depois **rebuild no Lovable pelo usuário**.
2. **Leitor de tela real (NVDA/VoiceOver)** — a r12 valida a árvore do Chromium, não a fala, a ordem de leitura nem os anúncios dinâmicos reais.
3. **Cobrir mutações no gate de regressão** e ampliar `ux:aria` para as demais rotas/diálogos fora das 5 jornadas.
4. **Harness para JOINs 400**, dívidas congeladas (22 alvos < 24 px, zoom 200%, viewport 320 px), governance do **NO-GO**: revogar PAT r6 e PAT 11/11, `anon`/JWT/`Usehub.xlsx`, 18 segredos via secret manager, grant/RLS formal, piloto e aceite.

---

## 8. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && (cd tests/harness && npm install)
npx playwright install chromium && npx playwright install-deps chromium
node scripts/e2e-isolated-server.mjs                 # gera .env.e2e.generated
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npx vite --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:aria  -- --label=depois --assert --out=/home/user/ux-evidence
npm run ux:names -- --label=depois --assert --out=/home/user/ux-evidence
```

---

## 9. Conclusão

A r11 provou, via DOM, que os nomes estavam corretos. A r12 foi além e perguntou ao Chromium **o que um leitor de tela recebe**. A resposta confirmou a r11 nos 8 campos — e encontrou **3 lacunas que nenhum audit anterior via**: 10 `combobox` do Radix sem nome, 1 diálogo de wizard sem nome e 1 campo manual ainda anunciado pelo placeholder. A/B de três estados no mesmo build: **10/8/1 → 10/1/1 → 0/0/0**.

O processo também exigiu corrigir **dois vieses do próprio instrumento de medição** antes de aceitar qualquer número. Isso é o ponto central da rodada: medir atributos DOM, medir a árvore de acessibilidade e escutar um leitor de tela real são três níveis de evidência diferentes — e **nenhum deles substitui o deploy utilizável**.

**12 arquivos locais, nada publicado** *(naquele momento; hoje estão em `6af2036`)*. O parecer técnico segue **NO-GO**; o deploy que o usuário acessa ainda não permite cadastrar cliente e não tem as correções de r7–r12. **CI verde não é evidência de aplicação utilizável.**
