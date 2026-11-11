# Avaliação UX — Rodada 7 (10/11/2026)

> **Origem:** `"[useerp.lovable.app] publicado confira e prossiga com o desenvolvimento"`. O usuário confirmou o rebuild no Lovable e pediu (a) conferência do deploy e (b) continuação do desenvolvimento. A frente **não** foi especificada; o assistente escolheu e executou, como nas rodadas anteriores.
> **Frente entregue:** **resiliência a falhas de backend (degradação graciosa)**. A tentativa inicial de medir o *caminho feliz* foi abandonada por limitação do harness — a decisão e a hipótese refutada estão registradas na §2.
> **Status:** **apenas local**. Sem commit, sem push, sem rebuild/deploy. A autorização pontual `"Atualize o github"` foi consumida por `2ca213c` + `f49857f` (r6). Publicar a r7 exige novo pedido.

---

## 1. Conferência do deploy (read-only)

| Item | Resultado |
|---|---|
| `GET /` | **HTTP 200**, 14.234 bytes, `USE ERP` no PWA, `lang="pt-BR"` |
| Bundle | **`index-DZI4eJHm.js` / `index-Ds9o8DYG.css`** (na r4 eram `index-BiVPbyU3.js` / `index-Ce4Pe4GW.css`) → build novo |
| Varredura | **402 arquivos / 12.427.772 bytes**, sequencial, com `User-Agent`, **0 erros de download** |
| Marcadores **r5** | `td[colspan]` ✅, `min(calc(100vw - 3rem), 420px)` ✅, `scrollRegionLabel` ✅ (`table-4EMGVZ5D.js`), `whitespace-nowrap` em 17 chunks ✅ |
| Marcadores **r6** | `"para iniciar o apontamento"` ✅, `"Selecione um cliente para avançar para os itens"` ✅, `"Adicione ao menos um item com produto e quantidade para avançar"` ✅, `"Selecione a forma de pagamento e a condição para avançar"` ✅, `scheduleFocusInvalid` em 3 chunks ✅, `focusFirstInvalidField` ✅, `aria-invalid`/`data-field` ✅ |
| Marcadores **r1–r4** | `USE ERP`, `TAB ou Enter`, `"Sem conexão com o servidor"`, `--muted-foreground 215 16% 40%`, `--warning-text 38 95% 32%`, `order.number` — todos presentes |

**Conclusão:** não é só HTML 200 — **r5 e r6 estão efetivamente servidas no deploy**. Não houve login, autenticação, smoke de escrita, acesso a dados reais nem chamada a produção autenticada.

---

## 2. Incidente de ambiente e mudança de frente (decisão registrada)

### 2.1 13ª saturação do sandbox
Ao iniciar a r7, `.git`, `node_modules` e o Chromium **desapareceram** e `tests/harness/data` reapareceu residual (mesmo padrão da 12ª saturação, na r5). **Nada foi perdido**: `f49857f` já estava no GitHub.

Restauração: `git clone --depth 1` → `f49857f` / 2840 arquivos; `diff -rq` encontrou **6 arquivos com conteúdo revertido** (`ConfirmDialog.tsx`, `confirmContext.ts`, `KPICard.tsx`, `StatusBadge.tsx`, `AttentionCenter.tsx`, `EnterpriseKPICard.tsx` — versões pré-r3). O hash do clone conferiu 1 a 1 com `git show HEAD:` nos 6 casos. Restauramos `.git` e a árvore via `tar --exclude='./.git'`, preservando o `.env` local. Resultado: **HEAD `f49857f`, worktree 0, 2841 arquivos**, marcadores r5/r6 presentes. Deps, Chromium 158 e libs reinstalados.

> **Erro a não repetir:** `cp -a clone/. .` tentou recopiar `.git` e falhou em packs read-only. A cópia da árvore deve excluir `.git` (o `tar --skip-old-files` da 12ª saturação também deve ir no **tar de extração**, não no de criação).

### 2.2 Hipótese refutada: "caminho feliz" não é mensurável neste harness
A frente inicial era medir **conclusão de tarefa** (preencher → submeter → persistir → lista atualizada). O inspector encontrou **todos os selects de negócio vazios** (fornecedor, produto, OP, cliente), o que sugeria "base vazia / primeiro uso" como achado clínico.

A instrumentação de rede **refutou isso**: os selects vazios são consequência de falhas do transporte isolado, não de seed vazio nem de defeito do produto:

```
400 /rest/v1/products?select=*,categories(name)
400 /rest/v1/orders?select=*,order_items(*)
400 /rest/v1/purchase_orders?select=*,suppliers(name),purchase_order_items(*)
```

São os JOINs já catalogados como **limitação conhecida do harness** (junto de `404 /functions/v1/*`, `405 REST`, WebSocket 404). Consultas simples como `branches`, `profiles`, `custom_entities`, `clients` retornam **200**. Medir "caminho feliz" ou "empty state de primeiro uso" aqui produziria **falso positivo** — por isso a frente foi trocada, não forçada.

### 2.3 O achado real que sobrou
Se a API falha e a tela **não diz nada**, o usuário não consegue distinguir "não há dados" de "o servidor falhou". É um defeito de produto, independente da causa da falha — e o harness isolado o reproduz naturalmente, sem mock.

---

## 3. Achados clínicos (medidos, não opinados)

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX7-01** | **Alta** | **4 de 5 rotas de negócio sofriam HTTP 400 e ficaram 100% silenciosas**: zero mensagem de erro, zero controle de nova tentativa, zero distinção entre "vazio" e "falhou". O usuário via um select sem opções e um botão cinza. | `antes-ab-resilience.json`: `silenciosas=4` (clientes, pedidos-venda, pedidos-compra, recebimento), `semRetry=4`, `vazamentoTecnico=0`, `jsErrors=0` |
| **UX7-02** | Média | **`ModuleErrorBoundary` não cobre erros de query.** Ele isola *crashes de render*; erros de `useQuery` são tratados pelo React Query e não lançam exceção — passam despercebidos. | `src/shared/components/ModuleErrorBoundary.tsx` vs. `useOrdersQuery.ts` (`if (error) throw error` dentro de `queryFn`) |
| **UX7-03** | Média | **Carregamento longo sem limite aparente.** `pedidos-venda` exibia `"Carregando pedidos..."` enquanto a consulta ficava em `fetchStatus: "fetching"` (1 retry com backoff). Com espera de 3 s a medição era **instável** entre execuções; com 8 s o estado se consolida. Não é travamento permanente, mas é lento e sem indicação de progresso. | `ux7-cache-debug`: query `["orders","ATACADO_INDUSTRIA",...]` em `pending/fetching` após 3,5 s; `depois` com 3,2 s marcou `presasCarregando=1`, com 8 s marca `0` |
| **Ponto positivo** | — | **0 vazamento de erro técnico**, **0 exceção JS não tratada**, **0 spinner infinito** (após consolidação). As mensagens existentes já eram em português. | `antes-ab-resilience.json` |

**Correção de viés metodológica:** a 1ª execução usou 3,2 s de espera e dividiu as rotas "2 com banner / 2 sem". Não era diferença de produto — era o retry do `QueryClient` ainda em curso. O audit passou a esperar **8 s** (configurável por `--wait`) e ganhou **A/B controlado no mesmo build** (`--no-banner` injeta só um CSS que esconde o banner). Sem isso, o resultado seria um falso negativo e um falso positivo simultâneos.

---

## 4. Correção implementada

**Um ponto global, não quatro remendos.** Novo `src/shared/components/BackendErrorBanner.tsx`, montado em `src/App.tsx` dentro do `QueryClientProvider`:

- observa o `QueryCache` e conta consultas com `status === "error"` **e observadores ativos** (ignora erros de rotas já abandonadas);
- mostra `role="alert"` com mensagem acionável em português — *"Não foi possível carregar alguns dados do servidor. Verifique sua conexão e tente novamente..."* — **sem** `PGRST`, `400`, `JWT`, stack ou `Failed to fetch`;
- botão **"Tentar novamente"** que refaz **somente** as consultas que falharam (`client.refetchQueries({ predicate })`), com estado de carregamento no próprio botão;
- desaparece automaticamente quando o cache volta ao normal.

É intencionalmente **genérico e global**: não expõe nomes de tabelas/queries e cobre qualquer tela futura sem exigir alteração por página. `ModuleErrorBoundary` continua cobrindo crashes de render — as duas camadas são complementares.

**Regressão:** `scripts/ux-resilience-audit.mjs` (`npm run ux:resilience`) com `--assert`, `--wait`, `--no-banner`, `--label` e `--out`. Mede por rota: chamadas ≥ 400, feedback visível, retry, vazamento técnico, exceções JS e carregamento preso. Recusa medição vazia (`--assert` falha se nenhuma rota for afetada). `src/shared/components/BackendErrorBanner.test.tsx` com **3 testes**: invisível sem falha; mensagem + retry + sem detalhe técnico; desaparece após retry bem-sucedido.

---

## 5. Resultado A/B controlado (mesmo build, 8 s)

| Métrica (5 rotas) | ANTES (`--no-banner`) | DEPOIS |
|---|---:|---:|
| Rotas afetadas por HTTP 400 | 4 | 4 |
| **Rotas silenciosas** | **4** | **0** |
| **Sem controle de retry** | **4** | **0** |
| Vazamento técnico | 0 | 0 |
| Exceções JS não tratadas | 0 | 0 |
| Presas em carregando | 0 | 0 |

`node scripts/ux-resilience-audit.mjs --label=depois --assert --wait=8000` → **exit 0**: *"toda falha de backend tem feedback acionável, retry e nenhum vazamento técnico."*

---

## 6. Validações executadas

| Verificação | Resultado |
|---|---|
| `npm run ux:resilience -- --assert` | ✅ exit 0 (A/B `antes-ab` → `depois`) |
| `ux:task`, `ux:labels`, `ux:a11y`, `ux:journey`, `ux:links`, `ux:responsive` — todos `--assert` | ✅ 7/7 audits; **105 rotas / 0 quebradas / 0 vazamentos**; responsividade 375/768/1440 sem `th` quebrados |
| `npm test` (vitest) | ✅ **97 arquivos / 452 testes** (449 da r6 + 3 novos) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos** (1236 `no-explicit-any` pré-existentes ignorados pelo gate) |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` | ✅ **24/24** (teardown removeu dados e `.env` gerado) |
| SEC-02 | ✅ **2674 arquivos / 0 referências fixas** (após `git checkout -- supabase/functions/mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |

**Não executado:** `typecheck`/`build` locais (limitação de sandbox já registrada nas r5/r6: `tsgo` e Vite excedem o timeout). Como **não houve push nesta rodada**, o CI também não rodou sobre este código — **não declaramos typecheck verde para a r7**. A cobertura real é lint, 452 testes, 32 specs E2E, 7 audits de browser e compilação/execução Vite em HMR.

---

## 7. O que **não** foi feito (e por quê)

- **Sem commit, push, rebuild ou deploy.** A autorização anterior foi consumida pela r6; a r7 são **5 arquivos no worktree** (2 modificados + 3 novos). `origin/main` segue em `f49857f`.
- **Nenhuma alteração em produção, banco real, migrations, grants, RLS ou gate**; nenhum dado de cliente; nenhuma credencial real; nenhum segredo/PAT/`.env` versionado. Probes temporários (`ux7-inspect`, `ux7-net-probe`, `ux7-cache-debug`), locks, `.env.e2e.generated`, `tests/harness/data` e relatórios gerados foram removidos; servidores e Postgres isolados parados.
- **Sem autenticação/smoke em produção.** A conferência do deploy foi **download de assets públicos**, sem login.
- **Sem mock de backend para forçar o "caminho feliz".** Injetar respostas sintéticas mediria a UI contra um backend falso e não provaria persistência — descartado por honestidade metodológica.
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px, 11 textos de paleta, zoom 200%, viewport 320 px, 7 dívidas do gate, 1236 `no-explicit-any`.
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild" (a r4 já foi publicada). Fora do escopo, mantido sem pedido.
- **Sem nova leitura do Google Drive** (app conectado, não consultado).

---

## 8. Próximos passos

1. **Publicar a r7** — exige autorização pontual para commit/push; depois, rebuild no Lovable pelo usuário. Sem isso, o deploy segue com r1–r6 e **não** com a r7.
2. **Caminho feliz real** — depende de evoluir o harness isolado para suportar os JOINs (`products?…categories(name)`, `orders?…order_items(*)`), ou de uma massa de seed compatível. É trabalho de infraestrutura de teste, não de UX; registrar decisão antes de implementar.
3. **UX7-03 (carregamento longo)** — avaliar `placeholderData`/timeout/`isFetching` explícito nas listas, para que "Carregando pedidos..." não fique sem progresso durante o retry. Medido, não corrigido nesta rodada.
4. **Banner mais contextual** — hoje é global e genérico por decisão de não vazar detalhes; se o produto quiser indicar o módulo afetado, fazê-lo com nomes de negócio, não de tabela.
5. **Leitor de tela real**, ampliação da amostra para Fiscal/Financeiro/Qualidade/PCP e fluxos de **edição**, zoom 200% e 320 px.
6. **Governança (bloqueante, fora de UX):** revogar/rotacionar o PAT (8 usos anteriores + 3 na r6), `anon`/JWT legado e `Usehub.xlsx`; 18 segredos via secret manager; G-01/G-02; grant/RLS formal; fiscal/SEFAZ, PSP, restore, piloto e aceite formal com commit/ambiente/data/responsável. **NO-GO** permanece.

---

## 9. Como reproduzir

Evidências em `/home/user/ux-evidence/` (`antes-ab-resilience.json`, `depois-ab-resilience.json`, `depois-resilience.json`, `rodada7-inspect.json`). Assets do deploy em `/tmp/ux7c/assets`.

```bash
cd /home/user/use-erp-implementation
npm install                        # bun ausente; npm ci falha por bun.lock
npx playwright install chromium    # + install-deps
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:resilience -- --label=antes-ab --no-banner --wait=8000 --out=/home/user/ux-evidence
npm run ux:resilience -- --label=depois --assert --wait=8000 --out=/home/user/ux-evidence
npm test && npm run lint:ci
```

O audit aborta toda origem externa e substitui o `config.js` por apontamento isolado. Nenhuma credencial de produção é usada.

---

## 10. Conclusão

O deploy foi **conferido de verdade**: r5 e r6 estão no bundle publicado, não apenas no GitHub. Ao tentar avançar para o caminho feliz, o harness revelou uma limitação — e, em vez de transformá-la num falso achado, a medição encontrou o defeito real: **quando o backend falha, o ERP ficava calado**. A correção é global, cobre qualquer tela presente e futura, foi provada por A/B no mesmo build e não toca em segurança, banco, gate ou produção.

**CI verde não é evidência de aplicação utilizável** — e, nesta rodada, o CI sequer rodou (sem push): o que há é evidência local, honesta e reproduzível. O status geral do projeto continua **NO-GO**. Para que o usuário final perceba esta melhoria, falta autorização para publicar e um novo rebuild no Lovable.
