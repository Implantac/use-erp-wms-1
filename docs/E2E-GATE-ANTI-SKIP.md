# Auditoria anti-falso-verde do gate autenticado — QA-07

**Data:** 07/11/2026 · **Status:** 🔍 **auditoria estática concluída · NENHUMA CORREÇÃO APLICADA**
**Produção: NO-GO** · **Relacionado:** `E2E-SEGREDOS-E-ROTACAO.md`, `ADR-QA05-GRANT-REWORK.md`, `infra/homologacao/README.md`

> **Regra desta rodada:** nenhum spec, `playwright.config.ts`, reporter, workflow ou
> gate foi alterado. Corrigir um teste que **nunca rodou** sem ambiente de
> homologação para validá-lo produziria a mesma falsa evidência que esta
> auditoria condena. Toda correção abaixo é **proposta**, depende de autorização
> explícita e de reexecução com `skip=0`.

## 1. Pergunta respondida

Antes de pedir os **18 segredos**, era preciso saber: *quando eles existirem, o
job `Jornadas autenticadas obrigatórias` vai rodar testes de verdade — ou pode
anunciar sucesso com testes ausentes, ignorados ou vacuamente verdes?*

Resposta: **o gate está protegido contra `skip`, mas não contra vacuidade nem
contra perda de completude**. Há **dois testes que podem passar sem validar o
que prometem** e uma lacuna estrutural no reporter.

## 2. O que o gate já faz certo

| Proteção | Onde | Efeito |
| --- | --- | --- |
| Step 4 `Validate isolated E2E configuration` | `.github/workflows/e2e.yml` | `exit 2` **antes** de qualquer teste se faltar 1 dos **18** segredos |
| `E2E_REQUIRE_ALL: '1'` (literal, não secret) | mesmo workflow, step `e2e:critical`, linha 86 | Liga o reporter anti-skip |
| `FailOnSkippedReporter` | `e2e/fail-on-skipped-reporter.ts` | Reprova `skipped > 0` **ou** `executed === 0` |
| `forbidOnly: !!process.env.CI` | `e2e/playwright.config.ts` | Impede `test.only` no CI |
| `testIgnore` dos isolados + 3 golden paths | `e2e/playwright.config.ts` | Impede que specs de Postgres embarcado apontem para homologação |
| `expected >= 3`, `skipped === 0` | `scripts/assert-playwright-public.mjs` | Piso de contagem do **smoke público** |

O log do job autenticado `128272140678` (HEAD `6ea7f55`) confirma **exatamente
18** linhas `Missing required isolated E2E setting` e `exit code 2`.

## 3. Achados

| ID | Sev. | Evidência | Impacto | Correção proposta (**não aplicada**) |
| --- | --- | --- | --- | --- |
| **G-01** | 🔴 Alta | `tests/e2e/logistic-fiscal-correlation.spec.ts:45` → `expect(correlationText).toContain('...')` | A asserção valida a presença de **reticências literais**, não o `correlation_id`. O teste pode passar com um texto truncado qualquer e **falhar** com o ID completo. É um falso positivo embutido no único spec que promete rastreabilidade logístico-fiscal | Capturar o `correlation_id` da `TRF-` antes de clicar em "Expedir" e comparar com o valor exibido; ou validar formato UUID por regex. Requer massa fiscal e ambiente |
| **G-02** | 🔴 Alta | `e2e/tests/navigation.test.ts:82-92` → teste "Verificar links de navegação da Central Unificada": dois `if` aninhados **sem `else`** | Se a URL contiver `login` **ou** o botão "Acessar Central Unificada" não estiver visível, o teste termina com **zero asserções** e o Playwright o reporta como **aprovado** | `await expect(supplyChainButton).toBeVisible()` antes do clique, ou `else` com falha explícita; eliminar a dependência de sessão implícita |
| **G-03** | 🔴 Alta | `e2e/fail-on-skipped-reporter.ts` → só `skipped` e `!executed` | O reporter **não congela quantos/quais specs** devem ser coletados. Remover um spec do `testMatch` ou renomeá-lo deixaria o job **verde com menos testes**. O smoke público tem piso `expected >= 3`; o autenticado **não tem** | Validador estático entregue (`scripts/validate-e2e-no-skip.mjs`) + opcional `assert-playwright-authenticated.mjs` com piso de contagem no CI. **Nada foi adicionado ao workflow** |
| **G-04** | 🟡 Média | `test.skip(!configured, …)` em `store-journey-ui.spec.ts:30`, `store-journey.spec.ts:60`, `textile-weaving-pcp.spec.ts:43` | Só são inofensivos **porque** o step define `E2E_REQUIRE_ALL: '1'`. Se essa linha sair, os 3 describes são ignorados e o job fica verde sem executar nada | Tornar o reporter **incondicional** no job autenticado, ou validar no workflow que a variável está presente antes do `e2e:critical` |
| **G-05** | 🟡 Média | `logistic-fiscal-correlation.spec.ts:10-35` | **Não faz login** — vai direto para rota protegida. Depende de sessão/contexto pré-existente, de massa (`taskCount > 0`) e de `waitForTimeout(2000)` para propagação do event bus | Login explícito por papel, massa determinística preparada no boot e espera por condição (`expect.poll`) em vez de tempo fixo |
| **G-06** | 🟢 Baixa | `e2e/tests/navigation.test.ts:53,76` | `waitForTimeout(700)` × 18 rotas e `(600)` × 8 aliases → espera fixa e flakiness | Substituir por asserções de estado |
| **G-07** | ℹ️ Info | `e2e/tests/navigation.test.ts:23` — `if (currentUrl.includes('login')) { … return; }` | **Não** é vacuamente verde: há uma asserção dentro do `if` **e** outra após o bloco. Registrado para não confundir com G-02 | Nenhuma |

## 4. Validador entregue

`scripts/validate-e2e-no-skip.mjs` (+ **15 testes** em
`scripts/validate-e2e-no-skip.test.mjs`) é **puramente estático**: não executa
Playwright, não precisa de segredo, não sobe servidor, não imprime valores e
**não está no CI**.

- A lista de specs é **derivada** de `testMatch`/`testIgnore` do
  `playwright.config.ts` — não duplicada. Hoje resolve **exatamente 6** specs:
  `navigation.test.ts`, `logistic-fiscal-correlation`, `store-journey-ui`,
  `store-journey`, `tenant-isolation`, `textile-weaving-pcp`.
- **Invariantes duros** (`exit 2` se violados): 6 specs presentes, nenhum
  isolado vazado, nenhum spec sem `test()` ou sem `expect()`, `testIgnore` dos
  isolados, reporter ligado a `E2E_REQUIRE_ALL`, `forbidOnly`, 18 segredos no
  step 4, `E2E_REQUIRE_ALL` **fora** da lista de segredos, `e2e:critical` no
  workflow, piso `expected >= 3` do smoke público.
- **Dívida conhecida** (impressa como aviso, não erro): os 5 padrões de falso
  verde. Hoje o relatório lista **7 ocorrências** nos specs reais.
- `--strict` trata a dívida como erro. Hoje **`--strict` falha de propósito**
  (`exit 2`) — é o marcador honesto de que G-01…G-06 **não foram corrigidos**.

```bash
node scripts/validate-e2e-no-skip.mjs           # OK, com 7 avisos
node scripts/validate-e2e-no-skip.mjs --strict   # exit 2 enquanto a divida existir
```

## 5. Decisões pendentes (dependem do responsável)

| Campo | Estado |
| --- | --- |
| Corrigir G-01 e G-02 (asserções) | **Não autorizado** — são specs de navegador que nunca rodaram; exigem ambiente para validar |
| Adicionar piso de contagem ao CI (G-03/G-04) | **Não autorizado** — `.github/workflows/e2e.yml` permanece intacto |
| Executar `bun run e2e:critical` com `skip=0` | **Impossível aqui** — 18 segredos + frontend de homologação |
| `--strict` verde | **Não** — e não deve ser forçado antes das correções |

## 6. Critério de saída

O gate autenticado só poderá ser declarado verde com: os 18 segredos via
secret manager, ambiente de homologação executado (ver
`infra/homologacao/README.md`), **G-01/G-02 corrigidos e validados**,
`node scripts/validate-e2e-no-skip.mjs --strict` com `exit 0`,
`bun run e2e:critical` com **`skip=0`** e artefatos anexados, além de SHA,
ambiente, data e responsável.

**CI verde não é evidência de aplicação utilizável.** Um job que passa com
`toContain('...')` ou com zero asserções é pior que um job vermelho: ele
**parece** evidência e não é. **NO-GO mantido.**
