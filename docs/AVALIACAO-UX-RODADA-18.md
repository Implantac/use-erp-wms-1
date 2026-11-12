# Avaliação UX — Rodada 18

**Concluída no workspace local/isolado. Sem commit, push, build de produção ou deploy. Produção permanece NO-GO.**

Continuação da r17, sobre HEAD/tracking **locais** `c93f91fb8e06cc39e2b86e3cf8138dc0c7d8c154`. Não houve consulta ao remoto, acesso a dados reais, nova leitura do Drive ou reutilização da autorização pontual de publicação de r15/r16. O ZIP e os 18 arquivos da r17 foram conferidos por SHA-256 antes das alterações.

## Resultado em uma página

- **Aviso inicial na falha persistente:** aproximadamente **7,0 s → 1,5 s**, medidos a partir do primeiro GET alvo, não do início da navegação.
- **Falha transitória e leitura lenta:** antes não havia aviso na janela testada; agora há aviso neutro nos nove casos correspondentes, incluindo 320 px.
- O aviso só afirma **“Estamos tentando novamente” quando o React Query confirma retry**. Enquanto o SDK ainda mantém a promise pendente, informa apenas que a consulta continua em andamento.
- Sem spinner adicional, toast, alerta prematuro ou bloqueio de ponteiro. Some em sucesso/erro final e deixa de considerar consultas sem observador ou pausadas.
- **A/B de um único arquivo**, 13 casos completos nos dois estados, com exatamente as mesmas sequências de tentativas/respostas. Nenhum sucesso/lista fabricado.
- **507 unitários / 106 arquivos; 168 contratos Node; 37 E2E isolados, sem skips.** Typecheck strict do recorte e lint aprovados. Quatro gates de regressão UX repetidos com sucesso.

**Não houve aceleração do backend nem redução das retentativas.** O erro final persiste em aproximadamente 15 segundos após o GET; a melhoria é dar informação correta durante essa espera, não declarar a consulta resolvida.

---

## 1. Causa e alteração mínima de produto

O `BackendLoadingNotice` observava apenas `fetchFailureCount > 0`. O SDK Supabase/PostgREST travado faz três retries internos antes de rejeitar a promise; durante essa primeira sequência, o React Query ainda tem `fetchFailureCount = 0`. Assim, o aviso antigo só surgia depois de aproximadamente sete segundos, embora a consulta já estivesse demorando.

### Novo comportamento

`src/shared/components/BackendLoadingNotice.tsx` continua sendo somente um componente de apresentação:

1. Considera consultas com observador e `fetchStatus === 'fetching'`.
2. Guarda a idade de cada consulta/ciclo observado. Após **1500 ms**, mostra:
   > Alguns dados estão demorando para carregar. A consulta continua em andamento.
3. Se o React Query confirmar falha/retentativa, mantém a mensagem já existente:
   > Alguns dados estão demorando para carregar. Estamos tentando novamente…
4. Remove o aviso quando termina, pausa ou perde o último observador. Um novo ciclo recebe prazo novo; consultas concorrentes conservam suas idades.
5. Usa **um timer para o próximo limiar**, sem polling contínuo no produto; unsubscribe, timer e mapa são limpos ao desmontar.

O estado inicial permanece silencioso para consultas rápidas. Não há gravação no cache, alteração de dados, chamada de refetch, cancelamento, timeout, política de retry ou instrumentação de `fetch`.

### Apresentação e acessibilidade

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"`;
- mensagem neutra não se apresenta como erro nem promete sucesso;
- sem novo spinner, botão, modal ou toast;
- `pointer-events: none`, com hit test real no Chromium;
- em 320×640, aviso observado em **x=16, y=562, 288×66 px**, totalmente dentro da viewport.

Isso verifica o contrato DOM/visual medido, **não** uma leitura real com NVDA/VoiceOver ou conformidade integral WCAG.

---

## 2. A/B controlado — mesma infraestrutura e mesmos testes

Alternou **somente `BackendLoadingNotice.tsx`** entre a fonte de HEAD e a correção. API, fixtures, dependências frozen, testes, audit, limites e demais fontes foram protegidos por hash. O arquivo corrigido foi restaurado e conferido ao fim.

### Matriz de 13 casos

Quatro rotas: **Clientes, Pedidos de venda, Pedidos de compra e Recebimento**.

| Cenário | Casos | Intervenção permitida | Resposta normal |
|---|---:|---|---|
| 503 persistente | 4 desktop | Somente 503 em GET do recurso alvo | Não há sucesso; exige erro final e retry |
| Um 503 transitório | 4 desktop | Primeiro GET falha após 700 ms | Retry seguinte continua para API/SQL/RLS reais |
| Leitura lenta sem erro | 4 desktop + 1 em 320 px | Segura o primeiro GET por pelo menos 3500 ms | O GET continua para API/SQL/RLS reais |

Login/sessão são reais no descartável, mantidos apenas em memória. Cada caso usa contexto/página novos. As origens externas são bloqueadas; marcador, origem e fixtures do isolado são exigidos. O recorder passivo observa o DOM desde antes da montagem da aplicação, sem criar aviso ou resultado de negócio.

### Resultados finais

| Medida | A — componente anterior | B — componente corrigido |
|---|---|---|
| Casos concluídos, sem erro de execução | 13/13 | 13/13 |
| Exit dos testes de feedback do A/B | 1; 11 falhas / 9 passes | 0; 20/20 |
| Exit do gate de loading | 1 | 0; 13/13 |
| Primeiro aviso, 503 persistente | **7025–7062 ms** | **1473–1495 ms** |
| Aviso após início do retry SDK, 503 persistente | **6017–6027 ms** | **438–480 ms** |
| Primeiro aviso em transitório/lento | ausente nos 9 casos | presente nos 9 casos |
| Primeiro aviso, todos os 13 casos | 9 ausentes | **1463–1495 ms** |
| GETs alvo totais | 45 | 45 |
| Sequências de status e `X-Retry-Count` | iguais às de B | iguais às de A |
| Mutação nos cadastros/pedidos monitorados | 0 | 0 |

Em cada caso persistente, mantiveram-se **oito tentativas**: `0,1,2,3,0,1,2,3`. Transitório: duas, `0,1`; leitura lenta saudável: uma, `0`. Os **nove HTTP 200** de cada estado vieram da API real, com array não vazio e fixture esperada encontrada.

No transitório, o aviso neutro pode aparecer antes da segunda chamada. A métrica “após retry” então é zero por definição; isso **não** significa renderização instantânea nem conhecimento do retry interno pelo componente.

O erro final do cenário persistente apareceu em **15064–15111 ms em A** e **15063–15082 ms em B**, a partir do GET. Não houve redução relevante desse tempo. As medições não incluem todo o bootstrap/login e não são SLA universal de rede ou da aplicação.

### Reprovação inicial preservada, sem afrouxar o gate

A primeira comparação mediu os avisos corrigidos em aproximadamente 1,5 s, mas **B ainda saiu 1**: um `setTimeout(3500)` liberou o GET após **3499 ms** pelo arredondamento do relógio. O gate corretamente recusou o cenário lento, e aquela comparação não foi apresentada como aprovada.

A correção foi na injeção: `waitUntilAtLeast()` confere o relógio e espera o restante se o timer acordar cedo. **O mínimo de 3500 ms, o teto do aviso de 2000 ms e os 800 ms após retry não mudaram.** Há regressões que recusam 3499 ms e simulam um timer que acorda 1 ms antes. Depois disso, o A/B completo foi repetido nos dois estados, com o mesmo audit corrigido. Logs e JSONs das duas comparações foram preservados separadamente.

---

## 3. Testes e gates

### Testes novos

**15 testes RTL**, com `QueryClient` e `QueryObserver` reais; apenas o tempo e as promises são controlados. Cobrem limiar sem flash, consulta pendente com contador zero, ARIA, ponteiro, sucesso, erro final, retry conhecido imediato, prefetch sem observador, abandono de rota, pausa/offline, eventos não relacionados, refetch novo, concorrência, StrictMode/cleanup e uso dos dados já exibidos.

Os cinco testes antigos de `LoadingFeedback` e os quatro do banner de erro foram mantidos. O antes reproduziu falhas de comportamento; não se baseou em import ausente ou erro de compilação.

**48 contratos Node** do audit recusam cobertura parcial/duplicada, cenário vazio, erro de execução, aviso preexistente ou tardio, ARIA inadequada, bloqueio de ponteiro, aviso fora da viewport, afirmação prematura de retry, vazamento técnico, exceção, mutação, redução das tentativas, sucesso vazio/simulado, falta de fixture, spinner/aviso final e atraso não reproduzido.

**Controle negativo no navegador também executado:** `--no-notice` ocultou apenas o aviso, mantendo a fonte corrigida, o erro final, os dados reais e as mesmas sequências de tentativas/status de B. Os **13 casos terminaram**, sem erros JS nem mutações monitoradas; o gate saiu **1**, como exigido. Foram 39 reprovações: uma pela própria flag e **38 por falta de feedback**. Recalculando o gate sobre o relatório bruto, sem a rejeição automática da flag e sem mudar timelines/respostas, as 38 reprovações de comportamento permanecem. Portanto, o teste não aprova uma tela sem aviso nem depende só de reconhecer a flag.

### Validação executada

| Verificação | Resultado |
|---|---|
| Dependências | Bun **1.4.2**, frozen na raiz e no harness, sem alterações; SDK **2.108.2**, Playwright **1.62.1**, Vitest **4.1.9** |
| Vitest completo | **106 arquivos / 507 testes**, exit 0 |
| Node, transporte + embeds + gates UX | **168/168**, zero skip: os 120 da r17 + 48 de loading |
| Guardas RLS separadas | **6/6**, exit 0; não são teste live de produção |
| E2E isolado | **37/37**, zero skip/flaky; 504 migrations + 3 seeds, exit 0 |
| Typecheck do feedback | **strict**, 9 arquivos `src` transitivos, incluindo componentes, testes e setup; exit 0 |
| Typecheck dirigido r17 | Produtos + teste/setup; spec/config E2E strict, exit 0 |
| Typecheck Node/Vite | `typecheck:node`, strict de `vite.config.ts`, exit 0; não é typecheck global do app |
| Lint | **0 erros / 0 warnings** reportáveis; 1236 achados históricos `no-explicit-any` seguem ignorados |
| SEC-02 final | **2717 arquivos / 0 referências fixas**, exit 0 |
| Gate autenticado estático | normal **0** / estrito **2**, mesmas sete dívidas e 18 nomes exigidos; não é execução autenticada |
| Integridade | whitespace limpo, YAML válido, locks/backend/retry/MCP e gates autenticados preservados |
| Loading A/B final | B aprovado nos **13 casos**, A recusado; código corrigido restaurado |
| Controle negativo de loading | **13/13 concluídos**, aviso oculto; exit **1** esperado, 38 reprovações de feedback mesmo sem rejeição da flag |
| `ux:related` repetido | **3 consultas / 3 telas**, zero erros e zero mutações de negócio monitoradas |
| `ux:resilience` repetido | **5 rotas / 4 afetadas**, feedback/retry no estado final; zero spinner final, JS ou vazamento técnico |
| `ux:users:error` repetido | **2 tentativas iniciais + 2 após clique manual**, zero extras sem ação; banner 170 px em 320 px, retry clicável |
| `ux:responsive` repetido | **5×12**, oito tabelas por viewport; zero alvos <24 px, controles fora, overflow e cortes nos critérios exigidos |

Os scripts/limites de resiliência e responsividade da r17 permaneceram iguais. A responsividade concluída tem um estado de erro local de Usuários por viewport, permitido só para geometria; não é lista de usuários saudável. 720×450 continua sendo reflow CSS, não zoom nativo, e o piso de 44 px não foi aprovado.

**Limites explícitos:** não foram repetidos os audits de formulários/i18n, todos os 18 audits históricos, E2E público, typecheck global do app, build de produção, CI remoto ou smoke autenticado de produção. O check dirigido não substitui o global, que tem histórico de OOM/lentidão no sandbox. As validações da r17 permanecem históricas onde não foram repetidas. O lote completo de unitários acima rodou antes do A/B; o componente restaurado é exatamente o mesmo, conferido por hash.

---

## 4. Fontes e reprodução

São **10 arquivos novos/alterados em relação à r17**, com **25 arquivos no lote acumulado r17+r18**. A mudança de produto desta rodada é somente `BackendLoadingNotice.tsx`. Acrescentaram-se seu teste real de cache, o audit/contrato de loading e a configuração strict dirigida; `package.json`, CI local e índice documental foram ampliados. As fontes de produto/fixtures/SQL da r17 foram preservadas.

**Não mudaram:** `App.tsx`/política do QueryClient, `useSupabaseQuery`, cliente Supabase, `BackendErrorBanner`, migrations, GRANTs, RLS, triggers, workflow/config/reporter do E2E autenticado ou `supabase/functions/mcp/index.ts`. A geração MCP continua em cache ignorado.

```bash
# Bun 1.4.2, na raiz do repo.
bun install --frozen-lockfile
(cd tests/harness && bun install --frozen-lockfile)
./node_modules/.bin/playwright install chromium
./node_modules/.bin/vitest run --maxWorkers=2
node --test scripts/e2e-isolated-lib.test.mjs \
  scripts/e2e-isolated-embeds.test.mjs scripts/ux-responsive-lib.test.mjs \
  scripts/ux-resilience-lib.test.mjs scripts/ux-loading-lib.test.mjs
bun run typecheck:ux-loading
bun run typecheck:ux-related
bun run typecheck:node
bun run lint:ci

# Sem API manual ocupando :54321; sobe e destrói seu próprio descartável.
bun run e2e:isolated
```

Para reproduzir a matriz de loading:

```bash
# Terminal 1: PostgreSQL/API descartáveis, somente loopback.
node scripts/e2e-isolated-server.mjs

# Terminal 2: frontend inerte fora dos audits; geração MCP no cache.
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=unit-test-only-key \
MCP_FUNCTIONS_DIR=node_modules/.cache/r18/supabase-functions \
  ./node_modules/.bin/vite --host 0.0.0.0 --port 4179 --strictPort

# Terminal 3: os 13 casos são obrigatórios; sem seleção parcial no gate.
node scripts/ux-loading-audit.mjs --label=repro-loading --assert
# Controle negativo também executado; deve sair 1, não aprovar --assert:
node scripts/ux-loading-audit.mjs --label=repro-hidden --no-notice --assert
```

O controle CSS negativo executado acima é complementar; não substitui o A/B real de fontes. O audit mudou de três casos transitórios da r8 para a matriz atual; os relatórios antigos não foram reclassificados retroativamente. O frontend assim configurado não é uma homologação externa funcional: os audits rodam no sandbox e apontam a API loopback. Os processos foram encerrados e o ambiente gerado foi descartado ao terminar.

### Evidências

Em `/home/user/ux-evidence/`:

- `r18-baseline-preservation.json` e logs frozen;
- **`r18-loading-ab.json`**, `r18-final-{a,b}-loading.json`, logs unit/UI e screenshots em 2100 ms/finais;
- `r18-loading-ab-initial.json` e `r18-ab-{a,b}-*`: comparação inicial recusada, preservada;
- `r18-loading-unit-before.log` / `r18-loading-unit-after.log`;
- `r18-vitest.log`, `r18-node-final.log`, `r18-isolated.{log,json}`, `r18-rls-guards.log`;
- `r18-typecheck-final.log`, `r18-typecheck-loading-files.log`, `r18-typecheck-node-final.log`, `r18-lint-final.log`;
- `r18-negative-control.json`, `r18-negative-no-notice-loading.json`/log e `r18-negative-without-flag-check.json`;
- `r18-regressions.json`, `r18-regression-{related,resilience,users-error,responsive}.json` e logs;
- índice final **`r18-final-validation.json`**, manifesto de fontes e backup **`rodadas-17-18-fontes-locais.zip`**, com checksum externo `.zip.sha256`.

O backup acumulado mantém também as fontes da r17, ainda não publicadas. Não inclui `.env.e2e.generated`, JWT, credenciais reais, dependências ou banco; constantes de teste são sintéticas. O ZIP anterior da r17 foi conservado intacto.

---

## 5. Pendências e liberação

- Reduzir o **tempo total de resolução** ou rever orçamento de retry ainda exige decisão própria e validação de carga/erro; esta rodada não fez essa alteração.
- Acessibilidade integral, leitor de tela real, zoom nativo, piso de 44 px e catálogo/jornadas completas continuam fora da prova.
- Não houve publicação ou deploy. Continuam os bloqueios de segurança/governança: **revogação dos cinco PATs expostos**, rotação das demais credenciais expostas, 18 segredos via secret manager, decisão formal de grant/RLS, G-01/G-02, operação/restore, integrações fiscal/SEFAZ/PSP, piloto e aceite.

**Conclusão:** o usuário passa a receber informação correta cedo, inclusive quando o retry interno do SDK é invisível ao React Query, sem alterar a política de rede ou inventar sucesso. A melhoria local foi comprovada com A/B e regressões. **NO-GO permanece; feedback melhor não é autorização para produção.**
