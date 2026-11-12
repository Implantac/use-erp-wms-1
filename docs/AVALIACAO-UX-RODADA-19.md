# Avaliação UX — Rodada 19

**Concluída localmente, em ambiente descartável. Sem commit, push, acesso remoto, build de produção ou deploy. Produção: NO-GO.**

Base local: `c93f91fb8e06cc39e2b86e3cf8138dc0c7d8c154`. Os **25 arquivos e o backup acumulado da r18** foram conferidos por SHA-256 antes de começar. Dependências reinstaladas com Bun 1.4.2 e locks frozen, sem alteração. As rodadas anteriores continuam não publicadas.

## Resultado

O botão global **“Tentar novamente”** agora seleciona a **chave exata** de cada consulta com erro e **aguarda uma recuperação já em andamento**, sem cancelá-la/reiniciá-la.

Na matriz adversarial controlada, isso eliminou **10 GETs desnecessários: 74 → 64**, mantendo exatamente os mesmos GETs iniciais, falhas induzidas e retries automáticos. Os dados em cache permaneceram utilizáveis, e a falha persistente continuou visível e acionável.

- A/B de um único componente: **4/4 casos em B**, A corretamente reprovado.
- **517 unitários / 107 arquivos**, **213 contratos Node**, **37 E2E isolados**, zero skip/flaky na suíte isolada.
- **Cinco regressões UX** repetidas: loading, leituras relacionadas, resiliência, erro/retry manual de Usuários e responsividade.
- O aviso antecipado da r18 continua aparecendo em aproximadamente **1,5 s**.

**Não se reduziu o retry automático nem o tempo até o erro final.** A economia de GETs pertence à matriz testada, não é uma estimativa de ganho universal no ERP ou em produção.

---

## 1. Defeito reproduzido

`BackendErrorBanner` obtinha as chaves das consultas com erro, mas chamava:

```ts
client.refetchQueries({ queryKey, type: 'active' })
```

Há dois efeitos do QueryClient real que o fake antigo de apresentação não reproduzia:

1. A correspondência padrão é **parcial**, inclusive em objetos dentro da chave. Repetir `['orders']` também pode repetir `['orders', 'summary']`; repetir `['orders', { branch: 'A' }]` pode alcançar um filtro mais específico e saudável.
2. `cancelRefetch` é **true** por padrão. Se já existe uma nova leitura de uma consulta com dados em cache, o clique pode cancelá-la logicamente e iniciar outra. Chaves com erro sobrepostas ainda podem iniciar a mesma recuperação mais de uma vez.

Isso contrariava a regra do próprio banner: repetir **somente** as consultas que falharam.

### Correção mínima de produto

Somente `src/shared/components/BackendErrorBanner.tsx` mudou no produto desta rodada:

```ts
client.refetchQueries(
  { queryKey, exact: true, type: 'active' },
  { cancelRefetch: false },
)
```

Mantiveram-se: seleção das falhas atuais com observador, `Promise.all`, estado de botão desabilitado/`aria-busy`, reabilitação após falha, mensagem, geometria e remoção do alerta após recuperação. Não houve alteração de `App.tsx`, hooks/cliente Supabase, cache/dados, SQL, RLS, GRANTs, timeout, política do SDK ou do QueryClient.

O botão continua aguardando todos os alvos. Se o GET que já estava em voo também falhar, a falha permanece; não se fabrica sucesso nem se inicia um ciclo extra sem nova ação.

---

## 2. Teste com cache real antes de corrigir

Novo arquivo `BackendErrorBanner.retry.test.tsx`: **10 testes** com `QueryClient` e `QueryObserver` reais, sem substituir o cache. Promises controladas permitem verificar chamadas, cancelamento e uso dos dados durante a recuperação.

Cobertura:

- descendente saudável e objetos parcialmente coincidentes não são repetidos;
- erros com chaves sobrepostas recebem uma execução cada;
- recuperação em voo é aguardada sem novo fetch ou evento de abort;
- descendente saudável já refazendo leitura não é reiniciado;
- consulta saudável sem prefixo e rota sem observadores não são afetadas;
- erro persistente mantém o alerta e permite novo clique;
- botão aguarda todos os alvos, e clique repetido enquanto desabilitado não duplica chamadas.

**Antes:** cinco falhas comportamentais nos testes novos. Por exemplo, a consulta saudável executou duas vezes em vez de uma; o filho com erro e a recuperação em voo executaram três vezes em vez de duas. Não eram falhas de import/compilação.

**Depois:** os dez testes novos passam. O lote focado de feedback tem **34/34**, incluindo os 24 testes anteriores. O teste antigo de mock foi **fortalecido** para exigir `exact: true` e o segundo argumento `{ cancelRefetch: false }`, não removido ou relaxado. Sua reprovação preliminar por aridade ficou registrada, assim como as correções de tipagem do novo teste.

---

## 3. A/B no Chromium com API/SQL/RLS reais

### Limite essencial da prova

`tests/ux/retry-recovery.{html,tsx}` é uma **fixture de componente**, não uma nova rota de produção nem uma jornada completa do ERP. Monta os componentes reais e o QueryClient/SDK travados. As chaves sobrepostas são intencionalmente adversariais; não se afirma que todas coexistam hoje na mesma página de produção.

Cada caso começa com **três GETs reais e não vazios**, para Pedidos, Compras e Produtos, com a fixture esperada do tenant A encontrada na resposta e na tela. **Não há `setQueryData` na fixture de navegador**, respostas 200 fabricadas ou substituição do conteúdo dos GETs bem-sucedidos. A sessão é emitida pela API isolada e fica apenas em memória; origens externas e mutações são bloqueadas.

O audit só injeta **503 em GETs selecionados** ou atrasa GETs que continuam para a API verdadeira. O atraso real mínimo de **3500 ms** é garantido pelo helper da r18, sem tolerância nova. Falhas SDK/QueryClient mantêm a sequência `0,1,2,3,0,1,2,3`, oito tentativas por consulta afetada em cada ciclo persistente.

### Quatro casos, clique real e dados existentes

| Caso | Situação antes do clique global | GETs na fase do clique — A | GETs na fase do clique — B |
|---|---|---:|---:|
| Prefixo, desktop | Pedidos com erro; Compras/Produtos saudáveis e descendentes | 3: um de cada tabela | **1: apenas Pedidos** |
| Erros sobrepostos, desktop | Pedidos e Compras com erro; Produtos saudável | 5: Pedidos×1, Compras×2, Produtos×2 | **2: um por consulta com erro** |
| Recuperação já em voo, desktop | Novo GET de Pedidos iniciado antes do clique e ainda pendente | 3 GETs extras | **0 extras; aguarda o GET existente** |
| Falha persistente, 320×640 | Pedidos continuam retornando 503 no retry manual | 10: oito de Pedidos + duas consultas saudáveis | **8: mesmo ciclo automático, só de Pedidos** |

Os GETs iniciais e de preparação das falhas, mais o GET em voo, são iguais: **53 em cada variante**. A fase do clique caiu de **21 para 11**, dando **74 → 64 no total**. Dos dez extras removidos, oito eram de consultas saudáveis e dois eram reinícios/duplicações de consultas afetadas.

Todo HTTP 200 veio da API real e continha a fixture esperada: **26 em A / 16 em B**. A diferença é justamente a remoção das leituras extras, não a omissão de dados necessários.

Nos quatro casos de ambas as variantes, o audit clicou no controle dos dados exibidos **antes, durante e depois** da recuperação: contadores **1 → 2 → 3**. Os dados/controles permaneceram disponíveis. Na falha persistente, o alerta permaneceu e o retry voltou a ficar habilitado; no sucesso, o alerta desapareceu. Zero exceções JS e zero mutações de negócio nesses audits de leitura.

### Controle e integridade

Alternou-se **somente o arquivo do banner** entre a fonte anterior e a corrigida. Mesmos testes, fixture, audit, ambiente, dependências e limites; demais fontes protegidas por hash. A fonte corrigida foi restaurada e conferida.

- A: exit unitário **1**, exit UI **1**, quatro casos concluídos, 25 reprovações do gate.
- B: exit unitário **0**, exit UI **0**, **4/4 concluídos e zero reprovações**.
- `sourceRestored`, `protectedUnchanged`, `fixtureUnchanged` e `sameInitialReadsAndFaults`: **true**.

A própria variante A é um controle negativo de comportamento: finaliza a recuperação e mantém dados, mas é recusada pelas leituras fora do escopo e pelos reinícios. Isso não é um gate que apenas exige HTTP 200.

---

## 4. Regressão executada

| Verificação | Resultado desta rodada |
|---|---|
| Instalação frozen | Bun **1.4.2**, raiz + harness, sem alterações; Supabase/PostgREST **2.108.2**, PW **1.62.1**, Vitest **4.1.9** |
| Vitest completo | **107 arquivos / 517 testes**, exit 0 |
| Contratos Node | **213/213**, zero skip: 168 existentes + **45 de retry** |
| Guardas RLS | **6/6**, exit 0; não são certificação live de produção |
| E2E isolado | **37/37**, zero skip/flaky; 504 migrations + 3 seeds, teardown completo |
| Typecheck strict de feedback | **10 arquivos `src` transitivos + fixture TSX**, inclui o novo teste real; exit 0 |
| Types dirigidos da r17 | Produtos + teste/setup, spec/config E2E strict, exit 0 |
| Typecheck Node/Vite | strict de `vite.config.ts`, exit 0 |
| Lint | **0 erros / 0 warnings** reportáveis; 1236 achados históricos de `no-explicit-any` seguem ignorados |
| SEC-02 final | **2723 arquivos / 0 referências fixas**, exit 0 |
| Gate autenticado estático | normal **0** / estrito **2**; mesmas sete dívidas e 18 nomes de segredos exigidos, sem execução autenticada |
| Integridade | YAML/sintaxe/whitespace aprovados; HEAD/staging, locks, SQL e gates autenticados preservados |
| Loading r18, sem mudar o audit | **13/13**, primeiro aviso **1439–1494 ms** após o GET; mesmas sequências de tentativas, sucesso real não vazio |
| Leituras relacionadas | **3 consultas / 3 telas**, zero erro e zero mutação monitorada |
| Resiliência 503 | **5 rotas / 4 afetadas**, feedback e retry finais, zero spinner preso/JS/vazamento técnico |
| Usuários com erro | **2 tentativas iniciais + 2 após clique**, zero extras sem ação; banner **170 px** em 320 px |
| Responsividade | **5 viewports × 12 rotas**, oito tabelas por viewport; zero falhas dos critérios exigidos |

Os **45 contratos novos** verificam completude, ausência de mock de sucesso, origem da resposta, fixture, GETs esperados por fase/tabela, ordem SDK, atraso real, clique durante o GET em voo, dados existentes, uso real dos controles, estado busy e manutenção do erro final. Reprovam, entre outros, GET extra de descendente saudável e reinício da consulta em voo.

O lote completo de Vitest rodou antes do A/B; o componente final restaurado é exatamente aquele testado, conferido por hash. Os audits de loading, resiliência e responsividade da r18 ficaram intactos. A suíte de 37 E2E é a de backend isolado já existente; os quatro casos do novo componente são contabilizados separadamente, não apresentados como quatro novas jornadas de produção.

**Não executados/revalidados:** typecheck global do app, build de produção, CI remoto, E2E público, todos os 18 audits históricos, formulários/i18n, submissão UI de pedidos, leitor de tela real, zoom nativo, piso de 44 px, smoke autenticado ou dados reais de produção. Reflow de 720×450 e Usuários em estado de erro continuam tendo os mesmos limites de prova da r18.

---

## 5. Fontes, reprodução e evidências

**13 arquivos novos/alterados em relação à r18; 34 no lote acumulado r17–r19.** Produto: somente o banner global. Verificação: teste real novo, expectativa do mock fortalecida, fixture HTML/TSX, audit/contratos, extensão do typecheck dirigido e comandos/gates de CI local. Os relatórios históricos da r17 e da r18 e seus ZIPs continuam intactos.

Configuração/reporter/workflow autenticados, retry automático, componente de loading da r18, Produtos/fixtures/SQL da r17, locks e `supabase/functions/mcp/index.ts` foram preservados. CI foi editado **localmente**; isso não significa execução remota aprovada.

### Reproduzir o recorte

```bash
# Na raiz, Bun 1.4.2 e Chromium da versão travada de Playwright.
bun install --frozen-lockfile
(cd tests/harness && bun install --frozen-lockfile)
./node_modules/.bin/playwright install chromium
./node_modules/.bin/vitest run --maxWorkers=2
node --test scripts/e2e-isolated-lib.test.mjs \
  scripts/e2e-isolated-embeds.test.mjs scripts/ux-responsive-lib.test.mjs \
  scripts/ux-resilience-lib.test.mjs scripts/ux-loading-lib.test.mjs \
  scripts/ux-retry-lib.test.mjs
bun run typecheck:ux-loading
bun run typecheck:ux-related
bun run typecheck:node
bun run lint:ci

# Sem API manual ocupando a porta: sobe/destrói seu próprio descartável.
bun run e2e:isolated
```

Para o audit de componente, em terminais separados:

```bash
node scripts/e2e-isolated-server.mjs

VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=unit-test-only-key \
MCP_FUNCTIONS_DIR=node_modules/.cache/r19/supabase-functions \
  ./node_modules/.bin/vite --host 0.0.0.0 --port 4179 --strictPort

node scripts/ux-retry-audit.mjs --label=repro-retry --assert
```

A fixture exige bootstrap do audit, host loopback e marcador do ambiente descartável. Não funciona como aplicação/homologação externa. Não se deve copiar bootstrap, JWT ou `.env` para arquivos de evidência. O frontend usa configuração inerte fora dos audits; o diretório MCP de geração fica em cache ignorado.

### Evidências em `/home/user/ux-evidence/`

- `r19-baseline-preservation.json` e logs frozen;
- **`r19-retry-ab.json`**, `r19-final-{a,b}-retry.json`, logs unit/UI e screenshots;
- `r19-retry-unit-before.log`, `r19-retry-unit-after.log`, registros preliminares preservados;
- `r19-vitest.log`, `r19-node-contracts-final.log`, `r19-rls-guards-final.log`;
- `r19-isolated.{log,json}`, `r19-checks.json`, logs de types/lint/segurança;
- `r19-regressions.json` e JSONs/logs/screenshots de `r19-regression-*`;
- `r19-teardown.json`, manifesto/final `r19-final-validation.json`;
- backup **`rodadas-17-19-fontes-locais.zip`**, checksum externo `.zip.sha256` e verificação `r19-package-verification.json`.

O ZIP acumulado inclui os arquivos completos novos/alterados e evidências, não um repositório instalável nem dependências/banco/credenciais reais. Todas as portas de teste foram fechadas e `.env.e2e.generated` foi removido.

## 6. Liberação e pendências

Esta rodada corrige a **seleção/deduplicação do retry manual**, não a duração do backend ou o orçamento de falhas. O erro consolidado continua levando aproximadamente 15–17 segundos nos cenários persistentes medidos, dependendo da referência de tempo do audit.

Persistem as pendências de segurança/governança: **revogar os cinco PATs expostos**, rotacionar outras credenciais expostas, configurar 18 segredos via secret manager, formalizar grant/RLS, G-01/G-02, operação/restore, integrações fiscal/SEFAZ/PSP, piloto e aceite. A autorização antiga de publicação não foi reutilizada.

**Conclusão:** o retry global agora se restringe à consulta realmente afetada e não reinicia trabalho já em curso. A/B e regressões sustentam a melhoria local, sem fabricar sucesso ou reduzir o retry automático. **NO-GO permanece; não houve publicação, deploy ou aceite de produção.**
