# Avaliação UX — Rodada 10 (10/11/2026)

> **Origem:** `"ok prossiga"` após a r9. Frente indicada na resposta anterior: **completar o ciclo do cliente — editar e excluir pela UI**, lacuna declarada no §6 do relatório r9. Não houve autorização de publicação; `"ok prossiga"` foi tratado como continuação de desenvolvimento, não como push.
> **Status:** **apenas local**. r7, r8, r9 e r10 seguem sem commit/push — **26 arquivos** no worktree (12 modificados + 14 novos). `origin/main` = `f49857f`. Sem rebuild/deploy.
> **Resultado:** ciclo **`POST 201 → PATCH 200 → DELETE 200`** provado com SQL real sob RLS. Corrigido um defeito de UX em confirmação destrutiva. Estendida a **infraestrutura de teste** (não o produto) para suportar `DELETE`.

---

## 0. Incidente de ambiente: 14ª saturação e reconstrução

Ao iniciar a rodada, o workspace havia sido resetado: `.git`, `node_modules`, Chromium, bibliotecas de sistema (`libnspr4.so`), dependências do harness e **6 arquivos do lote r7–r9** desapareceram. Os backups `/tmp/ux7-*` também sumiram.

| Etapa | Ação | Resultado |
|---|---|---|
| Inventário | 20 arquivos esperados → **14 sobreviventes**, 6 faltantes | `Orders.tsx`, `PageLoading.tsx` (versão pré-r8), `BackendErrorBanner.tsx`, `BackendLoadingNotice.tsx` e as 2 suítes r7/r8 |
| Restauração da base | `git clone --depth 1` de `f49857f` + `tar --exclude .git --skip-old-files` | `--skip-old-files` **preservou** os 14 locais; `.git` raso copiado à parte |
| Falso positivo evitado | 6 `src/shared/components/*` reapareceram como `M` em versão **pré-r3** | `git checkout --` nesses 6: eram lixo da saturação, **não** trabalho do lote |
| Reconstrução | 6 arquivos reescritos a partir dos **contratos medidos** nos audits (seletores `data-ux-*`, `role`, textos) e dos relatórios r7/r8 | `PageLoading` (`role=status`, `retrying`), os 2 componentes, as 2 suítes e o patch `retrying={failureCount>0}` em `Orders.tsx` |
| Dependências | `npm install`, `npm install` em `tests/harness`, `npx playwright install chromium`, `npx playwright install-deps chromium` | deps=3, Chromium 158, 39 libs nativas do Postgres, `libnss3`/`libnspr4` restauradas |
| Prova de fidelidade | `vitest` nos 4 arquivos afetados + `lint:ci` | **16/16 testes**, 0 erros; tipagem dos mocks refeita para voltar a **1236** `no-explicit-any` (nenhuma dívida nova) |

**Nenhum artefato foi perdido de forma silenciosa**: os relatórios, os 3 audits, as evidências em `/home/user/ux-evidence/` e as 2 suítes r9 sobreviveram. O `git status` final bate com o lote esperado.

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-lifecycle-audit.mjs` (`npm run ux:lifecycle`), com `--assert`, `--label`, `--out`, `--inject-delete-failure` |
| Ambiente | Chromium 158 + **API isolada QA-01** (504 migrations + 3 seeds, RLS real, só loopback). Origens externas abortadas, `config.js` neutralizado |
| Dados | **CNPJ sintético válido e único por execução**, nome/e-mail/telefone/CEP fictícios. Nenhum dado de cliente, nenhuma credencial de produção |
| O que mede | `POST`/`PATCH`/`DELETE` em `/rest/v1/clients`, toasts, abertura/fechamento de diálogos, nome na lista, "Total de Clientes", reidratação do formulário, vazamento técnico, exceções JS |
| Cenários | **ciclo completo** (`--assert`) e **falha induzida de DELETE** (`--inject-delete-failure --assert`), com a mesma resposta `405` nos dois lados do A/B |
| Evidências | `/home/user/ux-evidence/{baseline,antes-ab,falha-ab,depois}-lifecycle.json` |

**Antes/depois controlado:** para isolar a correção de produto, as 2 edições da r10 em `Clients.tsx`/`toastHelpers.ts` foram revertidas temporariamente (preservando a r9), medidas com `--inject-delete-failure` e restauradas. O **ambiente, o servidor, o build do frontend e a resposta de rede 405 foram idênticos** — só o código sob teste mudou. Não é um "A/B no mesmo build" (a correção é de código), e está registrado como tal.

---

## 2. Achados clínicos

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **Limitação do harness** | — | O servidor isolado só implementava `GET`/`POST`/`PATCH`; `DELETE` caía no `405 metodo/rota nao suportados` (`e2e-isolated-server.mjs:621`). **Não é defeito do produto** — é infraestrutura de teste. | `baseline-lifecycle.json`: `DELETE=405`, `confirmacao=false` de sucesso, contagem não volta |
| **UX10-01** | **Alta** | **Confirmação destrutiva fecha antes de se saber se a exclusão deu certo.** `AlertDialogAction` (Radix) chama `onOpenChange(false)` no clique, e `handleDelete` só fechava no `onSuccess`. Se o `DELETE` falha por RLS, FK, rede ou backend indisponível, o usuário perde o diálogo e o contexto, restando um toast. | `antes-ab-lifecycle.json`: `dialogoAbertoAposFalha=false`, `sucesso=false`, registro ainda na lista |
| **UX10-02** | **Média** | **Vazamento de mensagem de infraestrutura.** O `sanitizeErrorMessage` da r9 cobria SQL/RLS/PostgREST, mas não mensagens de roteamento: o toast exibiu `metodo/rota nao suportados: DELETE /rest/v1/clients`. | `antes-ab-lifecycle.json`: `vazamento=true`, `acionavel=false` |
| **UX10-03** | Baixa | **Nome acessível do CEP (dívida UX9-04, não corrigida).** `aria-label="00000-000"` em vez do rótulo visível "CEP *". Confirmado novamente; `ux:task` considera qualquer `aria-label` como nomeado. | `baseline-lifecycle.json` / probe da r9 |

**Correção de hipótese:** a 1ª leitura do baseline sugeria "exclusão quebrada no produto". A leitura do `e2e-isolated-server.mjs:621` **refutou** isso — o `405` vinha do harness. Seguindo a regra já aplicada na r7 (não transformar limitação do harness em achado de produto), o defeito de produto foi buscado **no comportamento diante da falha**, não no status em si. Foi assim que UX10-01 apareceu.

---

## 3. Correções implementadas

**Produto (2 arquivos):**
- `src/modules/commercial/Clients.tsx` — `onClick={(event) => { event.preventDefault(); handleDelete(); }}` impede o fechamento automático do Radix; `onError` reafirma `setIsDeleteOpen(true)`. O diálogo só fecha no `onSuccess`.
- `src/lib/toastHelpers.ts` — `sanitizeErrorMessage` passa a suprimir também `metodo/rota nao suportados`, `rota nao suportada`, `method not allowed` e verbos seguidos de `/rest/v1/`, devolvendo o fallback acionável da r9. Vale para **todas** as mutações.

**Infraestrutura de teste (3 arquivos, sem tocar em produção):**
- `scripts/e2e-isolated-lib.mjs` — nova `buildDeleteQuery(table, searchParams)`: **`DELETE FROM public."..." WHERE ... RETURNING *`**, parametrizado e **fail-closed** (sem filtro `eq./in./is.` não há DELETE, para um teste nunca apagar a massa inteira).
- `scripts/e2e-isolated-server.mjs` — handler `DELETE` executado sob `withRls()` (`SET LOCAL ROLE authenticated`), **SQL real**, não mock de resposta. Mesmo padrão de `POST`/`PATCH`.
- `scripts/e2e-isolated-lib.test.mjs` — **+1 teste** (11/11): SQL esperado, valor parametrizado, fail-closed sem filtro, filtro sem operador rejeitado, `quoteIdent` contra injection.

**Cobertura:** `scripts/ux-lifecycle-audit.mjs` + `ux:lifecycle` em `package.json`; **+1 teste** em `toastHelpers.test.ts` (466 no total) para o novo padrão de sanitização.

> **Transparência sobre a extensão:** implementar `DELETE` no servidor isolado é **completar a fidelidade do ambiente**, não "mockar o backend para forçar o caminho feliz" (prática recusada na r7). A resposta é produzida por SQL real sob RLS, e o audit mantém um cenário de **falha** que continua reprovando qualquer regressão. O gate anti-skip, o workflow e os 18 segredos **não foram alterados**.

---

## 4. Resultados

### 4.1 Antes/depois com a mesma resposta `405`

| Métrica | ANTES (`antes-ab`) | DEPOIS (`falha-ab`, `--assert`) |
|---|---:|---:|
| `DELETE` observado | 405 | 405 |
| Confirmação permanece aberta após falha | **não** | **sim** |
| Toast de erro | `Erro metodo/rota nao suportados: DELETE /rest/v1/clients` | `Não foi possível concluir a operação. Verifique os dados e tente novamente.` |
| Mensagem acionável | **não** | **sim** |
| Vazamento técnico | **true** | **false** |
| Registro desapareceu da lista | não | não |
| Exceções JS | 0 | 0 |

`--assert` no modo falha: **exit 0** — *"a confirmação permanece aberta, o erro é acionável e o registro não some."*

### 4.2 Ciclo completo (`--assert`)

```
POST=201  PATCH=200  DELETE=200   |   contagem 4 -> 5 -> 5 -> 4
criar:   sucesso=true  fechou=true  naLista=true
editar:  prefill="Cliente Sintético 397570"  sucesso=true  fechou=true  editadoNaLista=true
excluir: confirmacao=true  sucesso=true  removido=true
vazamento=false  jsErrors=0
```

`UX LIFECYCLE ASSERT OK: criar, editar e excluir cliente funcionam pela UI, com confirmacao e sem vazamento tecnico.`

---

## 5. Validações executadas

| Verificação | Resultado |
|---|---|
| `ux:lifecycle --assert` (ciclo) e `--inject-delete-failure --assert` (falha) | ✅ **2/2** exit 0 |
| **10/10 audits `ux:* --assert`** | ✅ `ux:lifecycle`, `ux:happy`, `ux:loading`, `ux:resilience`, `ux:task`, `ux:labels`, `ux:a11y`, `ux:journey`, `ux:links` (105 rotas / 0 quebradas), `ux:responsive` (22 alvos congelados) |
| `npm test` (vitest) | ✅ **100 arquivos / 466 testes** (465 da r9 + 1) |
| `node --test scripts/e2e-isolated-lib.test.mjs` | ✅ **11/11** (10 + 1) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos**, 1236 `no-explicit-any` (inalterado) |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` (com o servidor estendido) | ✅ **24/24** |
| SEC-02 | ✅ **2685 arquivos / 0 referências fixas** (após restaurar `mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |

**Instabilidade de medição registrada:** na bateria em sequência, `ux:journey` falhou 1 vez com *"Ctrl+K no Manual abriu a paleta global"*. Nada nesta rodada toca Ctrl+K. **3 rechecks isolados seguidos passaram**; o log da falha mostrava 14 falhas HTTP do harness sob carga. Tratada como **flutuação de timing (1 em 4)**, sem alterar produto nem audit. Se reaparecer, investigar com `--wait` maior antes de mexer no `ux-journey.mjs`.

**Não executado:** `typecheck`/`build` locais (limitação de sandbox desde a r5) e, sem push, nenhum CI rodou sobre r7/r8/r9/r10 — **não declaramos typecheck verde para estas rodadas**.

---

## 6. Limitações declaradas

- O `DELETE=200` só é possível porque o **ambiente isolado foi estendido**. Em produção, `BaseService.delete` continua dependendo de RLS/policies reais; este teste não prova grants nem permissões de produção.
- O `BackendErrorBanner` da r7 aparece durante todo o ciclo por causa dos **400/405 das consultas de apoio** do harness. O audit separa explicitamente esse banner do toast da mutação (como na r9) para não produzir falso positivo.
- Dados sintéticos são **descartados no teardown**; nunca tocaram produção.
- **UX10-03 / UX9-04 não foi corrigido**: mudar a precedência entre `placeholder` e `<Label>` afeta os 29 campos medidos na r6 e exige A/B próprio.
- Nenhuma leitura do Google Drive nesta rodada (app conectado, não consultado).
- Sem smoke autenticado em produção, sem aceite presumido, sem enfraquecimento de gate.

---

## 7. O que **não** foi feito

- **Sem commit, push, rebuild ou deploy.** `origin/main` segue em `f49857f`. O worktree reúne **26 arquivos** (12 modificados + 14 novos) das rodadas **r7 + r8 + r9 + r10**; uma única autorização publicaria as quatro.
- **Nenhuma alteração em produção, banco real, migrations, grants, RLS de produção ou workflow.** A extensão foi no servidor **isolado de teste**.
- **Sem mock de dados**: o único `route.fulfill` é o `--inject-delete-failure`, que **induz falha** (nunca força sucesso). `POST`/`PATCH`/`DELETE` verdes são SQL real.
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px, 11 textos de paleta, zoom 200%, 320 px, 7 dívidas do gate, 1236 `no-explicit-any`.
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild" (r4 já publicada).

---

## 8. Próximos passos

1. **Publicar r7 + r8 + r9 + r10 juntas** — exige autorização pontual. O deploy publicado **hoje ainda não permite cadastrar cliente** (UX9-01) e, para quem tenta excluir, **fecha a confirmação antes do resultado** (UX10-01). Depois, rebuild no Lovable pelo usuário.
2. **Cobrir mutações no gate de regressão** — lacuna que deixou UX9-01 passar por 465 testes e 24 E2E. `ux:happy` e `ux:lifecycle` existem; falta decidir se entram no CI sem enfraquecer o gate.
3. **UX10-03 / UX9-04** — precedência entre `placeholder` e `<Label>` na derivação de `aria-label`, com A/B sobre os 29 campos da r6.
4. **Ampliar o caminho feliz** para Compras/WMS/Vendas quando o harness suportar os JOINs (infraestrutura de teste).
5. **Leitor de tela real**, zoom 200%, 320 px, dívidas congeladas.
6. **Revogar/rotacionar o PAT da r6** e demais credenciais; governança do **NO-GO** (G-01/G-02, 18 segredos, grant/RLS formal, fiscal/SEFAZ, PSP, restore, piloto e aceite formal).

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && (cd tests/harness && npm install)
npx playwright install chromium && npx playwright install-deps chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:lifecycle -- --label=depois --assert --out=/home/user/ux-evidence
npm run ux:lifecycle -- --label=falha-ab --inject-delete-failure --assert --out=/home/user/ux-evidence
npm test && npm run lint:ci && node --test scripts/e2e-isolated-lib.test.mjs
```

---

## 10. Conclusão

A r9 provou **criar**; a r10 fecha **editar e excluir** com `POST 201 → PATCH 200 → DELETE 200` e contagem `4→5→5→4`. No caminho, um `405` do harness — que poderia ser confundido com "exclusão quebrada" — foi corretamente atribuído à **infraestrutura de teste**. O que ele revelou de real foi pior e mais sutil: **a confirmação destrutiva fechava antes de o resultado chegar**, e o erro ainda vazava rota interna.

As duas correções são cirúrgicas (`preventDefault` + fechar só no `onSuccess`; sanitizador ampliado), provadas por **antes/depois com resposta de rede idêntica**. Para completar o ciclo sem mock, o servidor isolado ganhou `DELETE` em **SQL real sob RLS**, com `buildDeleteQuery` fail-closed e teste próprio — sem tocar em produção, migrations, grants, workflow ou gate.

**26 arquivos locais, nenhum publicado.** O parecer técnico segue **NO-GO**. Enquanto não houver autorização de push e rebuild no Lovable, o sistema acessível ao usuário continua com o cadastro de cliente quebrado. **CI verde não é evidência de aplicação utilizável** — e esta rodada acrescenta que nem um `405` de ambiente deve ser lido como defeito de produto sem verificar quem o emitiu.
