# Evidência de CI publicada — QA-01 a QA-07

**Consolidação:** 09/11/2026 · **Fonte:** API do GitHub Actions (runs, jobs e logs por SHA), consultada nesta data
**Última entrega de QA consolidada:** `c95e747` · **Commit de criação deste documento:** `ab2fe8e` (documental) · **Produção: NO-GO**

## 1. Por que este documento existe

Até 09/11/2026 as evidências de CI estavam registradas **apenas no parecer
técnico** (`/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md`), que então **não
era versionado**. Na sequência o próprio parecer foi publicado como
[AVALIACAO-TECNICA-ERP-2026-11-05.md](AVALIACAO-TECNICA-ERP-2026-11-05.md);
este documento é a trilha resumida e reverificável na API: SHA,
run, job e contagem de testes, para que terceiros possam conferir sem depender
de um arquivo local. Segue o mesmo princípio do commit `4365895` ("Evidência
dos runs de CI levada para os documentos versionados").

Todos os IDs abaixo foram **reconsultados na API em 09/11/2026**; as contagens
de testes e o replay foram extraídos dos **logs dos jobs**. Nenhum número foi
transcrito de memória.

## 2. Tabela consolidada

| Entrega | SHA | `CI` | `Playwright Tests` | Job isolado | Testes isolados | Autenticado |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | `d7af1dfb` | `42097855161` ✅ ¹ | `42097855168` ¹ | ✅ ¹ | 7/7 ¹ | ❌ ¹ |
| QA-02 | `1eddaf7` | `42317975961` ✅ | `42317976000` ❌ | `128235234666` ✅ (smoke `128235234393` ✅) | 10 passed (9.9s) | `128235537914` ❌ step 4 (18 segredos) |
| QA-02b | `14e793c` | `42319602554` ✅ | `42319602538` ❌ | `128240668219` ✅ (smoke `128240667804` ✅) | 11 passed (8.1s) | `128240979033` ❌ step 4 (18 segredos) |
| QA-03 | `c998e55` | `42324642276` ✅ | `42324642296` ❌ | `128256984654` ✅ (smoke `128256984865` ✅) | 18 passed (8.5s) | `128257256658` ❌ step 4 (18 segredos) |
| QA-03b | `1c9aa70` | `42326086986` ✅ | `42326086927` ❌ | `128261588161` ✅ (smoke `128261588411` ✅) | 20 passed (9.1s) | `128261852547` ❌ step 4 (18 segredos) |
| QA-04 | `34b4d9c` | `42327100670` ✅ | `42327100673` ❌ | `128264793323` ✅ (smoke `128264793087` ✅) | 22 passed (9.7s) | `128265065140` ❌ step 4 (18 segredos) |
| QA-05 | `f5555e2` | `42327963694` ✅ | `42327963567` ❌ | `128267583622` ✅ (smoke `128267583845` ✅) | 24 passed (9.7s) | `128267797515` ❌ step 4 (18 segredos) |
| QA-06 | `6ea7f55` | `42329315304` ✅ | `42329315260` ❌ | `128271929172` ✅ (smoke `128271929490` ✅) | 24 passed (9.9s) | `128272140678` ❌ step 4 (18 segredos) |
| QA-07 | `c95e747` | `42608007378` ✅ | `42608007443` ❌ | `129128805128` ✅ (smoke `129128805390` ✅) | 24 passed (9.7s) | `129129184341` ❌ step 4 (18 segredos) |

**Jobs do `CI` (✅ nos 3 em todos os SHAs):** *Typecheck, lint, unitários e
guardas RLS*, *Build de produção* e *Harness de banco (replay + negócio)*.

**Jobs do `Playwright Tests`:** *Smoke público obrigatório* ✅, *Ambiente E2E
isolado* ✅ e *Jornadas autenticadas obrigatórias* ❌ no **step 4
`Validate isolated E2E configuration`**.

> ¹ **QA-01 (`d7af1dfb`)** não retornou runs nesta consulta: o SHA ficou fora
> dos últimos 100 commits examinados. Os IDs `42097855161` / `42097855168` e
> o resultado 7/7 vêm do registro histórico do parecer e **não foram
> revalidados agora** — estão marcados para não serem confundidos com evidência
> nova.

## 3. Leitura obrigatória

1. **Nenhum `Playwright Tests` inteiro ficou verde.** Em todos os 8 SHAs
   revalidados o workflow é ❌ porque o job autenticado para no step 4.
2. **São exatamente 18 segredos ausentes**, não 19, em **todos** os SHAs
   (contagem de linhas `##[error]Missing required isolated E2E setting` nos
   logs). A 19ª chave do bloco `env:` é `E2E_REQUIRE_ALL: '1'`, um literal.
3. O gate **não foi removido, reduzido nem relaxado** em nenhuma entrega. A
   mensagem do próprio step diz *"missing tests are never a successful gate"*.
4. **Todos os jobs isolados** fizeram `replay completo: 504 migrations + 3
   seeds`, com `skip=0`, sem nenhum segredo e sem rede externa.
5. `CI` ✅ **não é** smoke autenticado, nem evidência de aplicação utilizável,
   nem aceite. **CI verde não é evidência de aplicação utilizável.**
6. QA-06 e QA-07 **não acrescentaram testes ao job isolado** — por isso o nome
   do job permanece `Ambiente E2E isolado (QA-01 a QA-05)` e a contagem segue
   em **24**.
7. O commit puramente documental `ab2fe8e` (que criou este arquivo) teve
   `CI` `42611245126` ✅ e `Playwright Tests` `42611245090` ❌ no mesmo step 4 —
   coerente com a tabela, sem nova entrega de QA.

## 4. O que esta evidência **não** prova

- smoke autenticado medido, login por tela ou RLS exercitado por navegador;
- os **3 specs de navegador** irredutíveis (`store-journey-ui`,
  `logistic-fiscal-correlation`, `navigation.test.ts`) — e, pior, os achados
  **G-01/G-02** de `docs/E2E-GATE-ANTI-SKIP.md` mostram que dois deles podem
  passar **sem validar nada**;
- ambiente de homologação executado (`infra/homologacao/README.md` é proposta
  **não executada**, sem Docker neste sandbox);
- fiscal/SEFAZ, PSP/PIX, restore cronometrado, rotação de PATs e da chave
  `anon`/JWT legada;
- decisão sobre o grant de `production_rework_orders`
  (`docs/ADR-QA05-GRANT-REWORK.md` — **nenhuma opção aplicada**);
- **aceite formal** com commit, ambiente, data e responsável.

## 5. Como reproduzir a verificação

```bash
# Runs e jobs sao publicos (sem token):
curl -sS "https://api.github.com/repos/Implantac/use-erp-wms-1/actions/runs?head_sha=<SHA>&per_page=10"
curl -sS "https://api.github.com/repos/Implantac/use-erp-wms-1/actions/runs/<RUN_ID>/jobs?per_page=30"

# Logs de job exigem token de leitura; nunca registrar o valor:
curl -sS -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/Implantac/use-erp-wms-1/actions/jobs/<JOB_ID>/logs" | \
  grep -E 'replay completo|[0-9]+ passed|Missing required isolated E2E setting'
```

Localmente, a suíte sem segredos continua sendo:

```bash
bun run e2e:isolated                                  # 24 passed, skip=0
node --test scripts/*.test.mjs                        # 51/51
node scripts/check-hardcoded-project-refs.mjs         # SEC-02
node scripts/validate-e2e-no-skip.mjs --strict        # exit 2 enquanto G-01..G-06 existirem
```

## 6. Critério de saída

O job autenticado só poderá ser declarado verde com evidência publicada de:
SHA, ambiente de homologação identificado, data, responsável, os **18**
segredos via secret manager, **G-01/G-02 corrigidos e validados**,
`validate-e2e-no-skip.mjs --strict` com `exit 0`, `bun run e2e:critical` com
**`skip=0`** e artefatos anexados. Até lá, o ❌ é o **comportamento correto do
gate**. **NO-GO mantido.**

Documentos relacionados: [E2E-SEGREDOS-E-ROTACAO.md](E2E-SEGREDOS-E-ROTACAO.md),
[E2E-GATE-ANTI-SKIP.md](E2E-GATE-ANTI-SKIP.md), [E2E-Lojas.md](E2E-Lojas.md) §0,
[ADR-QA05-GRANT-REWORK.md](ADR-QA05-GRANT-REWORK.md).
