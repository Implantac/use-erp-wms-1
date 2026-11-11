# Avaliação UX — Rodada 9 (10/11/2026)

> **Origem:** `"prossiga"` após a r8. Frente escolhida: **o caminho feliz real** — concluir uma tarefa de negócio de ponta a ponta, lacuna declarada desde a r7 (que desistiu porque os selects de apoio vinham vazios por limitação do harness). O cadastro de **Clientes** não depende desses JOINs (`clients` retorna 200, validação é local), então é mensurável **sem mock e sem dados reais**.
> **Status:** **apenas local**. r7, r8 e r9 seguem sem commit/push — **20 arquivos** no worktree (8 modificados + 12 novos). `origin/main` = `f49857f`. Sem rebuild/deploy.
> **Resultado mais importante:** ao tentar criar um cliente, encontrou-se um **defeito funcional crítico que nenhum dos 465 testes, nenhum dos 24 specs E2E isolados e nenhum CI verde havia detectado**.

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-happy-path-audit.mjs` (`npm run ux:happy`), com `--assert`, `--label`, `--out` e `--preset=payload-antigo` |
| Ambiente | Chromium 158 + **API isolada QA-01** (504 migrations + 3 seeds, RLS real, só loopback). Origens externas abortadas, `config.js` neutralizado |
| Dados | **CNPJ sintético válido e único por execução** (dígitos verificadores calculados), nome/e-mail/telefone/CEP fictícios. **Nenhum dado de cliente, nenhuma credencial de produção** |
| Massa de seed | 1 cliente real do harness (`CLI-TESTE-001 / Confecção Exemplo LTDA`), consulta `GET /rest/v1/clients` → **200** |
| O que mede | `POST /rest/v1/clients` (status), toast de sucesso/erro, fechamento do diálogo, registro na lista, contagem "Total de Clientes", vazamento técnico, exceções JS |
| **A/B controlado** | `--preset=payload-antigo` reescreve **somente** o `document_type` do body do POST para minúsculas, reproduzindo o bug no **mesmo build** — sem alterar código entre as medições |
| Evidências | `/home/user/ux-evidence/{antes-ab,depois}-happy.json`, `rodada9-cliente-form.png`, `rodada9-cliente-depois.png` |

**Hipóteses refutadas nesta rodada** (registradas para não repetir):
1. *"A mutação falha silenciosamente."* **Falsa.** O toast `onError` existia e aparecia — meu 1º probe lia apenas `body.innerText.slice(-700)` e o `Toaster` está montado no **início** do body. Medimos toasts ao longo de 2 s e separamos o toast da mutação do `BackendErrorBanner` da r7 (que aparece por causa dos 400 das consultas de apoio, limitação do harness).
2. *"Selects vazios = base vazia."* Já refutada na r7; confirmado aqui que `clients` tem massa e retorna 200.
3. Dois erros do próprio probe: `getByRole('option', {name:/SP/i})` casava com "**Esp**írito Santo"; e o campo CEP não era encontrado por `/CEP/i` porque seu `aria-label` é o placeholder `00000-000`.

---

## 2. Achados clínicos

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX9-01** | **CRÍTICA** | **Criação de cliente totalmente quebrada.** A migration `20260702024835` impõe `CHECK (document_type IN ('CPF','CNPJ'))`, mas `defaultForm`, `setPersonType` e `buildClientPayload` enviavam `'cnpj'`/`'cpf'` em **minúsculas**. Todo `INSERT` era rejeitado pelo Postgres com `23514`. | `POST /rest/v1/clients` → **400** `{"message":"new row for relation \"clients\" violates check constraint \"clients_document_type_check\"","code":"23514"}`; `antes-ab-happy.json`: `POST=400`, `dialogoFechado=false`, `registroNaLista=false`, contagem inalterada |
| **UX9-02** | **Alta** | **O erro que escondeu o defeito.** `sanitizeErrorMessage` suprimia corretamente o SQL, mas o fallback de `toastError` era **"Ocorreu um erro inesperado"** — sem dizer ao usuário o que fazer e sem qualquer pista para quem investigasse. O `onError: handleMutationError` funcionava; a mensagem é que era inútil. | probe `t+300`: toast `"Erro / Ocorreu um erro inesperado"`; diálogo aberto, nenhuma mensagem inline |
| **UX9-03** | **Média** | **Leitura também inconsistente.** `clientToForm` comparava `c.document_type === 'cpf'`: com o valor real `'CPF'`, todo cliente físico reidratava como **PJ**. `InfoTab` comparava `=== 'cnpj'` e exibia "CPF" para CNPJ. | `formState.ts:28,30`, `clientDetail/InfoTab.tsx:9` (versão `f49857f`) |
| **UX9-04** | Baixa | **Nome acessível inadequado (não corrigido).** O campo CEP tem `aria-label="00000-000"` (derivado do `placeholder` pela r4) em vez do rótulo visível **"CEP *"**. O `ux:task` considera qualquer `aria-label` como "nomeado" e não detecta. Registrado como dívida, não alterado sem decisão de escopo. | `rodada9-cliente-form.png`; inspector: `{label: '00000-000'}` |

**Por que ninguém detectou antes:** o `e2e:isolated` (24/24) exercita golden paths de vendas/compras/produção/loja via RPC e SQL, mas **nenhum teste cria cliente pela UI**. O CI da r6 passou Typecheck, Build, lint e 447 testes. É a demonstração mais dura, até aqui, de que **CI verde não é evidência de aplicação utilizável**.

---

## 3. Correções implementadas

**Contrato único:** *form state em minúsculas · banco em MAIÚSCULAS*, com conversão apenas na entrada e na saída.

- `src/components/commercial/clientForm/formState.ts` — novas `toDbDocumentType()` / `toFormDocumentType()`; `buildClientPayload` envia `'CNPJ'|'CPF'`; `clientToForm` normaliza a leitura e deriva `person_type` de forma case-insensitive; `validateClientForm` usa o helper (defensivo).
- `src/components/commercial/clientDetail/InfoTab.tsx` — exibição case-insensitive.
- `src/lib/toastHelpers.ts` — fallback de `toastError` passa a ser **"Não foi possível concluir a operação. Verifique os dados e tente novamente."**, acionável e sem vazar SQL. Beneficia **todas** as mutações do ERP que usam `handleMutationError`.
- `scripts/ux-happy-path-audit.mjs` + `ux:happy` em `package.json`.
- **8 testes novos**: `formState.test.ts` (5 — conversões, payload aceito pelo CHECK, validação local preservada, reidratação de `'CPF'` sem virar PJ) e `toastHelpers.test.ts` (3 — não vaza `violates/constraint/policy`, preserva mensagem de negócio, `handleMutationError` usa o fallback acionável).

---

## 4. Resultado A/B (mesmo build, `--preset=payload-antigo`)

| Métrica | ANTES (payload minúsculo) | DEPOIS |
|---|---:|---:|
| `POST /rest/v1/clients` | **400** (`23514`) | **201** |
| Toast de sucesso | não | **"Cliente cadastrado com sucesso!"** |
| Diálogo fechou | não | **sim** |
| Registro na lista | não | **sim** |
| "Total de Clientes" | 3 → 3 | **3 → 4** |
| Toast de falha | "Erro / Ocorreu um erro inesperado" | *não aplicável*; em falha induzida agora diz "Verifique os dados e tente novamente." |
| Vazamento técnico / exceções JS | 0 / 0 | 0 / 0 |

`npm run ux:happy -- --assert` → **exit 0**: *"cliente criado, persistido e confirmado na lista, sem vazamento técnico."*

---

## 5. Validações executadas

| Verificação | Resultado |
|---|---|
| `npm run ux:happy -- --assert` | ✅ exit 0 (A/B `antes-ab` → `depois`) |
| **9/9 audits `ux:* --assert`** | ✅ `ux:happy`, `ux:loading`, `ux:resilience`, `ux:task`, `ux:labels`, `ux:a11y`, `ux:journey`, `ux:links` (105 rotas / 0 quebradas), `ux:responsive` |
| `npm test` (vitest) | ✅ **100 arquivos / 465 testes** (457 da r8 + 8 novos) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos** |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` | ✅ **24/24** |
| SEC-02 | ✅ **2683 arquivos / 0 referências fixas** (após restaurar `mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |

**Não executado:** `typecheck`/`build` locais (limitação de sandbox desde a r5) e, sem push, nenhum CI rodou sobre r7/r8/r9 — **não declaramos typecheck verde para estas rodadas**.

---

## 6. Limitações declaradas

- **Edição e exclusão não foram medidas** nesta rodada. O escopo foi o ciclo mínimo **criar → persistir → confirmar na lista**, que é onde o defeito estava. Editar/excluir exigem mapear o menu de ações da tabela e o `useConfirm` — próximo passo.
- O `BackendErrorBanner` da r7 aparece durante a criação por causa dos **400 das consultas de apoio** (`orders?…order_items(*)`, `products?…categories(name)`) — limitação conhecida do harness, não defeito do produto. O audit separa explicitamente esse banner do toast da mutação para não produzir falso positivo.
- O ambiente isolado é **descartado no teardown**: os clientes sintéticos não persistem entre rodadas e nunca tocaram produção.
- **UX9-04 não foi corrigido**: trocar a precedência entre `placeholder` e `<Label>` no `Input` afeta os 29 campos medidos na r6 e exige A/B próprio.
- Nenhuma leitura do Google Drive nesta rodada (app conectado, não consultado).

---

## 7. O que **não** foi feito

- **Sem commit, push, rebuild ou deploy.** `origin/main` segue em `f49857f`. O worktree reúne **20 arquivos** (8 modificados + 12 novos) das rodadas **r7 + r8 + r9**; uma única autorização publicaria as três.
- **Nenhuma alteração em produção, banco real, migrations, grants, RLS ou gate.** O CHECK constraint foi **respeitado**, não alterado — a correção é na UI. Nenhum dado de cliente, nenhum segredo/PAT/`.env` versionado.
- **Sem mock de backend**: a única reescrita é a do A/B (`--preset`), sobre o body do POST, para reproduzir o payload antigo. O `201` do DEPOIS é um `INSERT` real no Postgres isolado sob RLS.
- **Sem autenticação ou smoke em produção.**
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px, 11 textos de paleta, zoom 200%, 320 px, 7 dívidas do gate, 1236 `no-explicit-any`.
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild" (r4 já publicada).

---

## 8. Próximos passos

1. **Publicar r7 + r8 + r9 juntas** — exige autorização pontual. É especialmente importante aqui: além do CI, o deploy publicado **hoje não permite cadastrar cliente**. Depois, rebuild no Lovable pelo usuário.
2. **Completar o ciclo** — medir **editar** e **excluir** cliente pela UI, com o mesmo padrão de audit.
3. **UX9-04** — decidir a precedência entre `placeholder` e `<Label>` visível na derivação de `aria-label`; A/B próprio sobre os 29 campos da r6.
4. **Ampliar o caminho feliz** para Compras/WMS/Vendas quando o harness suportar os JOINs (infraestrutura de teste, não UX).
5. **Cobrir mutações no gate de regressão** — o `e2e:isolated` deveria criar ao menos um registro por módulo pela UI; foi exatamente essa lacuna que deixou UX9-01 passar. Requer decisão sobre o escopo do gate, sem enfraquecê-lo.
6. **Leitor de tela real**, zoom 200%, 320 px, dívidas congeladas e governança do **NO-GO** (PAT, `anon`/JWT, `Usehub.xlsx`, 18 segredos, G-01/G-02, grant/RLS, fiscal/SEFAZ, PSP, restore, piloto e aceite formal).

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && npx playwright install chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:happy -- --label=antes-ab --preset=payload-antigo --out=/home/user/ux-evidence
npm run ux:happy -- --label=depois --assert --out=/home/user/ux-evidence
npm test && npm run lint:ci
```

---

## 10. Conclusão

As rodadas 1–8 mediram **como o sistema se comporta quando algo dá errado**. A r9 finalmente tentou **fazer o trabalho** — e descobriu que não dava: **cadastrar cliente estava quebrado em produção** por um `document_type` em minúsculas contra um `CHECK` em maiúsculas, com 465 testes, 24 specs E2E isolados e CI verde no histórico. A mensagem de erro genérica ainda escondia a causa.

A correção é cirúrgica (normalização na entrada/saída do formulário), foi provada por **A/B no mesmo build** com `INSERT` real (`400 → 201`, contagem `3→3 → 3→4`), e veio acompanhada de fallback acionável e 8 testes de regressão. Nenhuma migration, grant, RLS ou gate foi tocado.

**CI verde não é evidência de aplicação utilizável.** Agora há evidência de que nem **testes E2E isolados verdes** substituem um caminho feliz exercitado pela UI. O status geral do projeto continua **NO-GO** — e, até autorização de publicação + rebuild no Lovable, o sistema que o usuário acessa **ainda não permite cadastrar cliente**.
