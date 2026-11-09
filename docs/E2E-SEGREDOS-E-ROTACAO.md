# Segredos do E2E autenticado, correção de contagem e plano de rotação

**Data:** 07/11/2026 · **Status:** diagnóstico, sem alteração de gates · **Produção: NO-GO**

## 1. Correção factual: são 18 segredos, não 19

O step `Validate isolated E2E configuration` de `.github/workflows/e2e.yml` itera **18** nomes. A contagem de 19 que circulou nas avaliações anteriores vinha do bloco `env:` do job, que declara 19 chaves — a 19ª é `E2E_REQUIRE_ALL: '1'`, um **literal**, não um secret. Nenhuma documentação deve continuar afirmando 19.

Os 18 são lidos de `secrets.*` do repositório GitHub. Sem todos eles o step encerra com `exit 2` **antes** de rodar qualquer teste, e a mensagem do próprio gate diz: *"missing tests are never a successful gate"*. É por isso que `Jornadas autenticadas obrigatórias` falha no step 4 em todos os SHAs recentes; **não é regressão de código**.

> **Decisão desta entrega:** o gate **não foi removido, reduzido nem relaxado**. Reduzir a lista de segredos exigidos sem um ambiente de homologação real produziria exatamente o falso verde que a avaliação técnica condena. O trabalho foi (a) mapear cada segredo, (b) dar cobertura equivalente no ambiente isolado onde isso é legítimo e (c) registrar o que depende de ação humana.

## 2. Inventário dos 18 segredos

"Cobertura isolada" indica onde a **intenção de negócio** já é provada sem segredos, em `bun run e2e:isolated` (24 testes, `skip=0`). Isso **não** substitui o job autenticado: os specs de navegador continuam exigindo um frontend de homologação.

| # | Secret | Consumidor(es) | Finalidade | Cobertura isolada equivalente |
| --- | --- | --- | --- | --- |
| 1 | `VITE_SUPABASE_URL` | todos os specs legados | URL do Supabase de homologação | `http://127.0.0.1:54321` (loopback, `playwright.isolated.config.ts`) |
| 2 | `VITE_SUPABASE_PUBLISHABLE_KEY` | todos | chave `anon` do projeto de teste | `e2e-isolated-anon-key` (valor público, sem segredo) |
| 3 | `E2E_TENANT_A_EMAIL` | `tenant-isolation.spec.ts` | login do tenant A | admin dos seeds (`E2E_MANAGER_EMAIL`) |
| 4 | `E2E_TENANT_A_PASSWORD` | idem | senha | `E2E_MANAGER_PASSWORD` |
| 5 | `E2E_TENANT_B_EMAIL` | idem | login do tenant B | **QA-04**: `tenant-b-qa04@useerp.test`, criado no boot |
| 6 | `E2E_TENANT_B_PASSWORD` | idem | senha | `E2E_TENANT_B_PASSWORD` do `.env.e2e.generated` |
| 7 | `E2E_STORE_EMAIL` | `store-journey.spec.ts`, `store-journey-ui.spec.ts` | login da loja | **QA-03**: `loja-qa03@useerp.test` (papel `operator`) |
| 8 | `E2E_STORE_PASSWORD` | idem | senha | `E2E_STORE_PASSWORD` do boot |
| 9 | `E2E_MANAGER_EMAIL` | idem | login do gestor | **QA-03**: admin dos seeds |
| 10 | `E2E_MANAGER_PASSWORD` | idem | senha | `E2E_MANAGER_PASSWORD` do boot |
| 11 | `E2E_PRODUCT_ID` | `store-journey.spec.ts` | produto com saldo no CD | `E2E_PRODUCT_ID` descoberto por `code='PLUMA-01'` |
| 12 | `E2E_STORE_BRANCH_ID` | idem | filial de destino | `E2E_STORE_BRANCH_ID` (fixture `Loja QA-02`) |
| 13 | `E2E_CD_BRANCH_ID` | idem | unidade de origem | `E2E_CD_BRANCH_ID` (Matriz dos seeds) |
| 14 | `E2E_WEAVING_EMAIL` | `textile-weaving-pcp.spec.ts` | login do operador PCP | gestor/admin isolado |
| 15 | `E2E_WEAVING_PASSWORD` | idem | senha | credencial do boot |
| 16 | `E2E_WEAVING_PRODUCT_ID` | idem | produto acabado | `E2E_WEAVING_PRODUCT_ID` (`TECIDO-PLANO-01`) |
| 17 | `E2E_WEAVING_COMPONENT_ID` | idem | insumo | `E2E_WEAVING_COMPONENT_ID` + BOM congelada do snapshot (QA-03b) |
| 18 | `E2E_WEAVING_LOT_ID` | idem | lote de entrada | `E2E_WEAVING_LOT_ID` + descoberta por componente (QA-03b) |

**Não é segredo:** `E2E_REQUIRE_ALL='1'` (liga o reporter anti-skip no job autenticado), `MCP_FUNCTIONS_DIR` (caminho de cache), `E2E_BASE_URL` (padrão `localhost:8080`).

## 3. Specs que ainda compõem o job autenticado

`e2e/playwright.config.ts` ignora explicitamente os specs isolados (`isolated-*.spec.ts` e os 3 golden paths), para que nunca sejam apontados para homologação/produção. Restam:

| Spec | Natureza | Situação |
| --- | --- | --- |
| `tenant-isolation.spec.ts` | API, 2 tenants | **Intenção coberta por QA-04** no isolado, com prova de não-vacuidade e simetria A↔B. Mantido no legado; não foi removido. |
| `store-journey.spec.ts` | API, jornada por papel | **Coberta por QA-02** (cadeia completa) e **QA-03** (separação loja/gestor). Mantido no legado. |
| `textile-weaving-pcp.spec.ts` | API, PCP | **Coberta por QA-03/QA-03b** (OP, reserva, qualidade, conclusão transacional, genealogia). Mantido no legado. |
| `store-journey-ui.spec.ts` | **navegador** (`page.*`) | **Irredutível**: exige frontend servido + login por tela. `test.skip` se as 4 credenciais faltarem. |
| `logistic-fiscal-correlation.spec.ts` | **navegador** (`page.*`) | **Irredutível**: clica em "Expedir" e valida rastro de `correlation_id` até rascunho de NF-e; exige massa operacional preparada e integração fiscal. |
| `e2e/tests/navigation.test.ts` | **navegador** | Redirecionamento de rota protegida e estrutura da raiz; exige app rodando. |

Ou seja: **a API já está coberta no isolado; o que falta é o frontend + fiscal/PSP**. Não há atalho honesto para transformar esses três specs de navegador em testes sem ambiente de homologação.

## 4. O que seria necessário para o job autenticado ficar verde

0. **Pré-voo local:** `node scripts/validate-homologacao-env.mjs` com as variáveis carregadas de um arquivo **não versionado**. O script lê os 18 nomes do próprio workflow, reprova placeholders, PAT em texto e URL de produção, e nunca imprime valores (5 testes unitários; `--list` ajuda a provisionar). É diagnóstico do operador — **não** substitui a execução dos testes, **não** está no CI e **não** afrouxa o gate.
1. Um ambiente de **homologação isolado**, com frontend (`vite dev`/build servido) e banco migrado, sem nenhum dado de cliente e sem apontar para produção. **QA-06 (07/11/2026):** o repositório já tem essa topologia em `docker-compose.local.yml`; o overlay `infra/homologacao/docker-compose.homologacao.yml`, o `bootstrap.sh` e o `homologacao.env.example` a restringem para teste (loopback, sem `:latest`, teardown obrigatório). É **proposta não executada** — sem Docker neste sandbox — e está auditada em `infra/homologacao/README.md`.
1. **QA-07 — antes de provisionar, conferir o gate:** `node scripts/validate-e2e-no-skip.mjs` prova estaticamente que o job coletará os **6** specs esperados, que o reporter anti-skip está ligado a `E2E_REQUIRE_ALL` e que nenhum spec está vazio. O relatório `docs/E2E-GATE-ANTI-SKIP.md` registra **dois testes que podem passar sem validar nada** (`logistic-fiscal-correlation.spec.ts:45` com `toContain('...')` e `navigation.test.ts:82` com `if` aninhado sem `else`) e a lacuna de **completude** do reporter. **Nenhuma correção foi aplicada** e `--strict` falha de propósito enquanto a dívida existir. Corrigir esses testes depende de autorização e de ambiente para validá-los.
2. Cadastrar os **18** segredos no repositório GitHub (Settings → Secrets and variables → Actions), preferencialmente por secret manager, nunca em texto no chat nem em arquivo versionado.
3. Preparar massa determinística: 2 tenants, usuários de loja/gestor/PCP, produto com saldo, filial loja e CD, produto/componente/lote de tecelagem, e uma transferência em `SEPARAÇÃO` para o spec fiscal.
4. Só então rodar `bun run e2e:critical` com `E2E_REQUIRE_ALL=1` e **zero `skip`** — o reporter anti-skip já está configurado para reprovar.

Enquanto isso não existe, o job ❌ é o **comportamento correto do gate**, não um defeito a ser silenciado.

## 5. Rotação de credenciais — depende de ação do responsável

O assistente **não tem acesso** ao painel GitHub nem ao Supabase e não pode revogar/rotacionar nada. Registro do que precisa ser feito, sem valores:

| Item | Exposição | Ação necessária | Urgência |
| --- | --- | --- | --- |
| **PAT antigo** | Colado em texto pelo usuário em várias rodadas; usado via helper efêmero removido em `582b9ee6`, `ef636878`, `d7af1dfb`, `4365895`, `0211229`, `03133e0`, `a5bd59f`, `653ad43` e outros | **Revogar** em GitHub → Settings → Developer settings → Personal access tokens | **Imediata** |
| **PAT novo** | Também colado em texto; usado em `f39f780`, `12f5686`, `1eddaf7`, `dbff378`, `14e793c`, `c998e55`, `1c9aa70` | **Revogar** e substituir por token de escopo mínimo, injetado por variável de ambiente/secret manager | **Imediata** |
| **Chave `anon` / JWT do projeto legado** | Valores públicos (URL + `anon`) estão em `public/config.js`, a **única exceção nomeada** do SEC-02; o JWT `anon` embutido em migrations históricas foi sanitizado, mas o histórico do Git não foi reescrito | **Rotacionar** a chave no projeto legado e revisar se o projeto antigo ainda existe/está ativo; republicar `config.js` com a nova chave | **Imediata** |
| **`.env` local** | Desrastreado desde `9080eead`, preservado no disco e ainda presente no histórico do Git | Confirmar que não contém `service_role`/`DATABASE_URL`; não versionar; considerar rotação de tudo que já esteve no histórico | Alta |
| **`credential.helper` / helpers efêmeros** | Verificado ausente após cada push | Nenhuma ação; manter a prática de helper temporário removido | — |

**Boas práticas a adotar:** nunca colar token no chat; usar `GITHUB_TOKEN` de workflow ou PAT de escopo mínimo com expiração curta; preferir variável de ambiente a helper de credencial; auditar o histórico do repositório antes de qualquer aceite formal.

## 6. Critério de saída

O job autenticado só poderá ser declarado verde quando houver **evidência publicada** de: commit/SHA, ambiente de homologação identificado, data, responsável, os 18 segredos configurados de forma segura, **G-01/G-02 corrigidos e validados**, `node scripts/validate-e2e-no-skip.mjs --strict` com `exit 0`, `bun run e2e:critical` com `skip=0` e artefatos de relatório anexados. **CI verde não é evidência de aplicação utilizável**, e smoke público/não autenticado não substitui esse aceite.

**Trilha auditável:** [EVIDENCIA-CI-QA.md](EVIDENCIA-CI-QA.md) consolida os runs de QA-01 a QA-07, com os 18 segredos ausentes confirmados nos logs de **todos** os SHAs revalidados e `504 migrations + 3 seeds` em cada job isolado.

Documentos relacionados: [E2E-Lojas.md](E2E-Lojas.md) §0, [ENVIRONMENT.md](ENVIRONMENT.md) §0.2 e a avaliação técnica fora do repositório (`/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md`).
