# Avaliação UX — Rodada 17

**Situação: implementação e validação locais, sem commit, push, build de produção ou deploy.**

Base do trabalho: `c93f91fb8e06cc39e2b86e3cf8138dc0c7d8c154` (documentação posterior ao código r15/r16, `271e484`). HEAD e tracking **locais** permanecem nessa base; não houve nova consulta ao remoto nesta rodada. A autorização pontual de publicação de r15/r16 não foi reutilizada. Sem nova leitura do Drive, dados reais, smoke autenticado em produção ou aceite.

## Resultado executivo

1. **Produtos:** a categoria do detalhe agora usa `categoryName`, o mesmo contrato da listagem. O campo `category_name` pertence a outro caminho de serviço e não foi alterado. Ausência de nome mostra `—`.
2. **Infraestrutura de teste:** as três consultas relacionadas que antes falhavam com HTTP 400 agora executam SQL real no PostgreSQL descartável, com FKs do catálogo e RLS aplicada também aos filhos. Não são respostas de sucesso simuladas.
3. **Três telas medidas com massa não vazia:** Produtos, Vendas e Compras passaram em listagem/detalhe e seletores de apoio. A auditoria não submete pedidos nem afirma conclusão de uma venda ou compra.
4. **Regressão final:** **492 unitários / 105 arquivos; 120 testes Node de contrato; 37 E2E isolados, sem skips.** Lint e typechecks dirigidos aprovados.
5. **Responsividade:** cinco viewports × 12 rotas, com oito tabelas por viewport, mantendo todos os limites em zero. **Resiliência:** falha 503 reproduzida em quatro rotas; feedback e retry disponíveis após esgotamento das retentativas, sem spinner final ou vazamento técnico.

**Produção continua NO-GO.** O resultado é do ambiente isolado. A demora de aproximadamente 16 segundos para consolidar o erro 503 não foi corrigida nem transformada em aprovação de desempenho.

---

## 1. Problema removido do harness, não atribuído à produção

O servidor E2E entendia apenas projeção plana. Estas leituras usadas pela aplicação falhavam com `identificador invalido: "*"`:

| Leitura | Baseline do isolado | Resultado final |
|---|---:|---|
| `products?select=*,categories(name)` | 400 | 200; categoria como objeto; fixture encontrada |
| `orders?select=*,order_items(*)` | 400 | 200; dois itens da fixture, sem multiplicar o pai |
| `purchase_orders?select=*,suppliers(name),purchase_order_items(*)` | 400 | 200; fornecedor como objeto e dois itens |

A limitação impedia observar o caminho normal de algumas telas e também fornecia uma falha acidental ao audit de resiliência. Removê-la não demonstra que o PostgREST de produção tivesse esse defeito.

### Compilador restrito

`scripts/e2e-isolated-embeds.mjs` implementa somente o subconjunto necessário:

- catálogo estrutural de tabelas/FKs `public`, incluindo FKs compostas e unicidade da origem; **618 FKs validadas** no replay;
- projeção, aliases e hint de FK; relação inexistente ou ambígua é recusada;
- subconsultas correlacionadas: coleção retorna `[]`; relação singular retorna objeto ou `null`;
- ordenação e paginação continuam sobre os **pais**, não sobre os filhos;
- não há `JOIN` que multiplique pais nem `LIMIT 1` para ocultar cardinalidade incorreta;
- limites: **4096 caracteres, profundidade 2, 80 nós e 12 embeds**;
- sintaxe fora do subconjunto, modificadores de join, casts/funções e filtros de filhos falham fechado, sem resultado parcial.

Não é uma implementação completa de PostgREST. O catálogo é lido durante o boot privilegiado, mas **linhas de negócio continuam dentro de `withRls()`**, com transação, claims e `SET LOCAL ROLE authenticated`. Nenhuma policy, permissão, trigger ou constraint foi flexibilizada.

### Serialização JSON coerente

O driver `pg` devolvia `numeric` da raiz como string, enquanto os filhos serializados pelo PostgreSQL já tinham números. O GET isolado agora usa `row_to_json` na raiz e o mesmo `sendRows` que trata cardinalidade singular. Isso preserva números, booleanos e nulos, sem mudar role, filtros, ordem ou paginação.

A nova asserção E2E verifica `total: 30`, `discount: 0`, `delivery_date: null`, dois itens numéricos e `active: true`. A UI de Vendas também precisa mostrar o KPI **`R$ 30,00`**, não apenas HTTP 200. Essa correção é do transporte de teste; não é uma mudança do cálculo financeiro de produção.

---

## 2. Massa adversarial e provas sob RLS

`scripts/e2e-isolated-related-fixtures.mjs` cria dados sintéticos transacionais exclusivamente no boot descartável: duas empresas/filiais, categorias próprias e compartilhada, fornecedores, produtos com FK própria/nula/de outro tenant, vendas com dois itens e sem itens, e compras com fornecedor próprio/nulo/de outro tenant.

As vendas têm filial e `ATACADO_INDUSTRIA`, respeitando os filtros reais da tela. Corrigir a fixture não exigiu remover filtros da aplicação.

Os **13 testes QA-17**, dentro dos 37 E2E, cobrem:

- positivos não vazios para A e B antes das negativas;
- pai visível não libera automaticamente categoria, fornecedor ou itens de outro tenant;
- existência do dado negado comprovada pela leitura de seu dono;
- FK nula → `null`; coleção sem filhos visíveis → `[]`;
- categoria compartilhada com `company_id = null` seguindo a policy real;
- aliases, hint de FK, projeção aninhada e ausência de campos extras;
- paginação/ordenação de pais, alias sem sequestrar `ORDER BY`, e `limit=0`;
- escalares JSON e `.single()`/`.maybeSingle()`, incluindo 406/PGRST116 para zero ou múltiplos pais;
- entrada não suportada → 400; JWT ausente/inválido → 401.

O filho adversarial em `purchase_order_items` é permitido pelas constraints existentes; `order_items` mantém sua guarda de tenant. Nenhuma trigger foi desabilitada para montar a prova. As policies existentes incluem exceções e hierarquias: **não se afirma isolamento absoluto de todas as tabelas ou certificação integral de RLS**.

---

## 3. Produtos — correção de produto comprovada por A/B

`inventoryService.getProducts()` normaliza a relação em `categoryName`. A lista usava esse campo; o detalhe tentava ler `category_name`. A correção mantém o tipo `ProductWithCategory` no estado/handlers e exibe `categoryName || '—'`.

### A/B final com dependências travadas

Mesma API, sessão de infraestrutura, massa, testes, harness, compilador e auditoria. **Somente `src/pages/inventory/Products.tsx` alternou** entre HEAD e a correção.

| Medida | A — fonte de HEAD | B — fonte corrigida |
|---|---:|---:|
| Exit do teste unitário de Produtos | 1 | 0; 2/2 testes |
| Exit da auditoria de três telas | 1 | 0 |
| Jornadas completas | 2/3 | 3/3 |
| Categoria no detalhe | ausente | presente e igual à listagem |
| HTTP das três consultas originais | 200/200/200 | 200/200/200 |
| Escritas de negócio na auditoria | 0 | 0 |

Nove arquivos protegidos e o ambiente de fixtures mantiveram seus hashes. A fonte corrigida foi restaurada e conferida ao fim. Prova: `r17-product-ab-locked.json`; relatórios e screenshots: `r17-locked-ab-{a,b}-*`.

Os testes RTL usam o Select/Dialog reais. Na primeira suíte completa após travar dependências, a fábrica do teste sem categoria também criava uma opção de filtro com nome vazio, proibida pelo Radix. A fixture foi corrigida para separar a coleção válida de filtros da FK nula do produto, **sem mockar o Select nem mudar o componente para satisfazer o teste**. O log dessa falha foi preservado; o A/B acima já usa a mesma fixture corrigida nos dois estados.

### O que as telas finais comprovaram

- **Produtos:** categoria na lista e no detalhe.
- **Vendas:** dois itens na lista/detalhe; KPI R$ 30,00; cliente e produto selecionáveis; etapa de itens apta a avançar.
- **Compras:** fornecedor e dois itens no detalhe; seletores de fornecedor/produto com opções reais da fixture.

Não houve envio dos formulários de pedido. Esta auditoria de UI não é prova de criação, contabilização, recebimento ou conclusão transacional desses pedidos.

---

## 4. Resiliência sem depender do antigo HTTP 400

O default de `ux:resilience` passou a induzir **somente 503 em GET** de `orders`, `products` e `purchase_orders`, após login e durante a medição. Auth, RPC, escritas e outras leituras não recebem respostas simuladas. Origem loopback, marcador e configuração do descartável são exigidos.

### Diagnóstico da espera

O primeiro gate com 503 foi recusado. Aos oito segundos ainda não havia retry manual nas quatro rotas, Clientes estava sem feedback e Vendas/Compras tinham spinner. A análise do SDK travado mostrou:

1. `postgrest-js 2.108.2` faz três retentativas internas, com 1+2+4 segundos;
2. o React Query repete a consulta uma vez;
3. cada consulta observada fez a sequência de headers `X-Retry-Count` **0,1,2,3,0,1,2,3**.

O audit conserva o snapshot aos oito segundos por padrão e agora espera o estado consolidado **por condição**, com teto padrão de 25 segundos, máximo permitido de 30. Não mudou a política de retry do produto, não adicionou `Retry-After` para acelerar o teste e não removeu critérios de falha.

Também foi corrigido um problema do próprio controle natural: um `--wait=8000` consumia todo o orçamento antes da condição, resultando em timeout de 1 ms; respostas tardias da página inicial podiam ser atribuídas à primeira rota medida. Agora o snapshot reserva orçamento e cada rota usa uma página nova na mesma sessão. As respostas de erro da página medida continuam integralmente registradas, sem lista de exclusão para fazê-las passar. Os casos do orçamento curto têm regressão unitária.

### Resultado final

| Rota | Respostas 503 | Estado final |
|---|---:|---|
| Clientes | 8 | feedback + retry; sem spinner final |
| Pedidos de venda | 8 | feedback + retry; sem spinner final |
| Apontamento | 0 | observada sem indução; conteúdo renderizado |
| Pedidos de compra | 16, em dois endpoints | feedback + retry; sem spinner final |
| Recebimento | 8 | feedback + retry; sem spinner final |

Consolidação medida entre **16,074 e 16,405 segundos após o início da observação**, dentro do teto. Zero vazamento técnico e zero exceções JS medidas. **Aos oito segundos ainda havia a janela ruim de feedback/carregamento. Ela permanece como pendência de UX/desempenho**, não como problema resolvido pelo ajuste de observação.

O controle `--fault=natural --assert` teve cinco rotas consolidadas e zero erros HTTP/JS, mas saiu **1 corretamente por medição vazia**. O gate não pode aprovar resiliência sem reproduzir falha. Seus **28 testes de contrato** recusam cobertura parcial, timeout, página vazia, erro silencioso, ausência de retry, vazamento, spinner, exceção e injeção fora do contrato.

A presença do botão foi verificada nessas quatro rotas; o clique de retry de leituras não foi executado por este audit. O retry manual efetivamente clicado pertence ao audit separado de Usuários abaixo.

---

## 5. Validação final e limites

Dependências reinstaladas com **Bun 1.4.2 e `--frozen-lockfile`**, na raiz e no harness; os dois locks ficaram inalterados. Havia drift local: Supabase 2.109.0 → **2.108.2**; Playwright 1.65.0 → **1.62.1**; Vitest 4.1.12 → **4.1.9**; Vite 5.4.21 → **5.4.19**; TypeScript 5.9.3 → **5.8.3**. O Chromium correspondente foi instalado. A evidência final usa as versões travadas, sem atualizar dependências do projeto.

| Verificação final | Resultado |
|---|---|
| Vitest completo, dois workers | **105 arquivos / 492 testes**, exit 0 |
| Contratos Node | **120/120**, zero skip: 11 transporte + 55 embeds + 26 responsividade + 28 resiliência |
| Guardas RLS unitárias/estáticas, separadas | **6/6**, exit 0; não é teste live de produção |
| E2E isolado | **37/37**, zero skip/flaky; replay de 504 migrations + 3 seeds; exit 0 |
| Typecheck dirigido de Produtos | **64 arquivos `src` transitivos**, incluindo página, teste e setup; exit 0 |
| Spec QA-17 e configuração E2E | TypeScript **strict**, exit 0 |
| Configuração Vite/Node | TypeScript, incluindo `vite.config.ts`, exit 0 |
| Lint reportável | **0 erros / 0 warnings**; 1236 achados históricos `no-explicit-any` continuam ignorados |
| SEC-02 final | **2713 arquivos / 0 referências fixas**, exit 0 |
| Diff/workflows | whitespace limpo; YAML válido; workflow/config/reporter autenticados e scripts responsivos inalterados |
| `ux:related` | **3 consultas / 3 telas**, zero erro HTTP/JS medido e zero escrita de negócio |
| `ux:resilience` | **4 falhas reproduzidas em 5 rotas**, critérios finais aprovados; controle natural recusado por vacuidade |
| `ux:responsive` | **5×12**, oito tabelas por viewport; todos os limites exigidos em zero |
| `ux:errors` | 5 jornadas, 36 controles, 6 inválidos / 6 mensagens vivas; zero descritor ausente/quebrado, mensagem solta ou erro do audit |
| `ux:users:error` | 503 induzido; **2 tentativas iniciais + 2 após retry manual**, zero extras sem ação; banner de 170 px em 320 px; botão recebe pointer; sem spinner/JS |
| `ux:i18n` | **12 rotas + 5 diálogos / 791 nós**, zero nomes em inglês, strings base ou erros medidos |
| Anti-skip autenticado, estático | normal **exit 0** / estrito **exit 2**, mesmas sete dívidas e gate dos 18 segredos preservados |

**Não se anuncia typecheck global do app concluído:** o recorte dirigido não substitui o check global, que tem histórico de OOM/lentidão no sandbox. Não houve build de produção, E2E público repetido, nova bateria dos 18 audits, CI remoto ou smoke autenticado de produção na r17. Os resultados remotos de r15/r16 continuam históricos.

A primeira tentativa responsiva desta rodada excedeu 270 segundos, sem relatório final: não foi contada como aprovação nem defeito geométrico comprovado. A execução final concluiu em aproximadamente 180 segundos com mais prazo externo de execução, **sem mudar os scripts, a amostra, o CSS ou os limites responsivos**.

| Viewport | Rotas / tabelas | Alvos <24 / controles fora / overflow / cortes | Alvos <44, informativos |
|---|---|---|---:|
| 320×640 | 12 / 8 | 0 / 0 / 0 / 0 | 116 |
| 375×812 | 12 / 8 | 0 / 0 / 0 / 0 | 118 |
| 720×450 | 12 / 8 | 0 / 0 / 0 / 0 | 145 |
| 768×1024 | 12 / 8 | 0 / 0 / 0 / 0 | 507 |
| 1440×900 | 12 / 8 | 0 / 0 / 0 / 0 | 527 |

Regiões horizontalmente roláveis focáveis, zero cabeçalhos quebrados e zero estados vazios cortados. Há um estado de erro local de Usuários por viewport, admitido apenas para geometria: o harness não implementa sua função saudável. **Não é conformidade WCAG integral, teste de zoom nativo, leitor de tela real nem aprovação do piso de 44 px.** Em `ux:errors`, a jornada de novo pedido de venda não submeteu o formulário e mediu zero controles; não se amplia sua cobertura por contar cinco jornadas.

---

## 6. Arquivos e reprodução

Mudanças de produto restritas a `Products.tsx` e seu novo teste. Infraestrutura: compilador/testes de embeds, fixtures, transporte/servidor isolados, spec/config E2E, audit de leituras relacionadas, audit/contrato de resiliência, typecheck dirigido e integração no CI local. **`supabase/functions/mcp/index.ts` permanece igual ao HEAD**; a geração de testes usa cache ignorado. Não ficou configuração temporária `.r17-typecheck.json`.

```bash
# Na raiz do repositório; Bun 1.4.2.
bun install --frozen-lockfile
(cd tests/harness && bun install --frozen-lockfile)
./node_modules/.bin/playwright install chromium

node --test scripts/e2e-isolated-lib.test.mjs \
  scripts/e2e-isolated-embeds.test.mjs \
  scripts/ux-responsive-lib.test.mjs scripts/ux-resilience-lib.test.mjs
./node_modules/.bin/vitest run --maxWorkers=2
bun run lint:ci
bun run typecheck:ux-related
./node_modules/.bin/tsc -p tsconfig.node.json --noEmit

# Sobe e destrói sua própria API/PG. Não deixar a API manual ocupando :54321.
bun run e2e:isolated
```

Para os audits de UI, usar dois terminais locais e executar os audits serialmente em um terceiro:

```bash
# Terminal 1: banco/API sintéticos e descartáveis, somente loopback.
node scripts/e2e-isolated-server.mjs

# Terminal 2: frontend inerte fora da auditoria; geração MCP no cache ignorado.
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=unit-test-only-key \
MCP_FUNCTIONS_DIR=node_modules/.cache/r17/supabase-functions \
  ./node_modules/.bin/vite --host 0.0.0.0 --port 4179 --strictPort

# Terminal 3: somente as origens locais; config.js apontado para o descartável.
node scripts/ux-related-reads-audit.mjs --label=repro-related --assert
node scripts/ux-resilience-audit.mjs --label=repro-503 --assert
node scripts/ux-resilience-audit.mjs --label=repro-natural --fault=natural --assert
# O comando natural acima deve falhar por vacuidade se não houver erros.
node scripts/ux-responsive-audit.mjs --label=repro-responsive --assert
node scripts/ux-errors-audit.mjs --label=repro-errors --assert
node scripts/ux-users-error-audit.mjs --label=repro-users --assert
node scripts/ux-i18n-audit.mjs --label=repro-i18n --assert
```

O frontend assim iniciado **não é uma homologação funcional acessível externamente**: os audits executam no sandbox, usando API loopback e configuração controlada. Ao fim desta rodada, ambos os processos foram encerrados e o ambiente gerado descartado.

### Evidências preservadas

Em `/home/user/ux-evidence/`:

- índice final `r17-final-validation.json`;
- `r17-dependency-lock.json` e logs frozen;
- `r17-product-ab-locked.json`, `r17-locked-ab-{a,b}-related.json`, logs e seis screenshots;
- `r17-node-final.log`, `r17-vitest-final.log`, `r17-isolated-locked.{log,json}`;
- `r17-lint-final.log`, `r17-typecheck-final.log`, `r17-types-products-files-final.log`, `r17-typecheck-node-final.log`;
- `r17-final-resilience.json`, `r17-natural-final-resilience.json` e `r17-resilience-final-results.json`;
- `r17-locked-{responsive,errors,users-error,i18n}.json` e respectivos logs;
- logs de tentativas anteriores mantidos, incluindo falhas e timeout; o índice aponta quais resultados são finais. A reprovação 503 inicial está em `r17-audit-resilience-503.log`; `r17-final-resilience.json` é da execução final e substituiu o JSON intermediário de mesmo nome;
- backup **`rodada-17-fontes-locais.zip`**, com fontes alteradas, patch, manifesto SHA-256 e evidências selecionadas; checksum externo em `.zip.sha256`.

O backup não contém `.env.e2e.generated`, JWT, credenciais reais, dependências ou banco. As constantes públicas de teste dos fontes continuam sintéticas. Não é commit nem publicação.

---

## 7. Pendências e decisão de liberação

- **UX:** reduzir a demora/silêncio antes do erro consolidado 503, com decisão explícita de orçamento e sem multiplicar retries; conservar a telemetria inicial, não só o estado final.
- **Cobertura:** submissão UI dos pedidos, jornadas autorizadas de homologação, catálogo completo, leitor de tela real, contraste, zoom nativo e alvos de 44 px continuam fora da prova desta rodada.
- **Publicação:** r17 não foi publicada. Nenhuma autorização antiga de PAT foi reutilizada; não houve consulta remota ou deploy.
- **Segurança/governança:** revogar os **cinco PATs expostos**, rotacionar demais credenciais expostas, configurar 18 segredos via secret manager, decidir formalmente grant/RLS e resolver os bloqueios já registrados no parecer técnico, incluindo G-01/G-02, operação/restore, integrações fiscal/SEFAZ/PSP, piloto e aceite.

**Conclusão:** uma inconsistência de categoria foi corrigida com prova A/B, e três caminhos antes bloqueados pelo transporte isolado agora têm leituras relacionadas e cobertura não vazia sob SQL/RLS real. A validação local está concluída para esse recorte. **NO-GO permanece; testes locais verdes não autorizam produção.**
