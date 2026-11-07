# E2E — Lojas e smoke de navegador

## 0. Ambiente isolado auto-contido (QA-01, 05/11/2026)

`bun run e2e:isolated` executa `tests/e2e/isolated-environment.spec.ts` contra um servidor que **só escuta em 127.0.0.1** e é destruído a cada execução. Não há segredo, credencial de homologação, rede externa nem acesso a produção.

- `scripts/e2e-isolated-server.mjs` sobe o Postgres embarcado (o mesmo binário do harness), reaplica **stubs + baseline + patches + todas as 504 migrations + 99-local-final + os 3 seeds determinísticos**, cria um marcador `public.e2e_isolation_marker` e expõe o subconjunto da API Supabase usado pela suíte: `POST /auth/v1/token` (valida `crypt()` contra `auth.users`), `GET /rest/v1/<tabela>` e `POST /rest/v1/rpc/<fn>`.
- Cada consulta roda sob `SET LOCAL ROLE authenticated` com `request.jwt.claims` preenchido. **RLS e funções de negócio são reais** — não há mock de dados. `scripts/e2e-isolated-lib.mjs` concentra o parser PostgREST, o JWT efêmero (segredo gerado por execução) e a recusa de qualquer origem não-loopback; tem 8 testes unitários.
- `e2e/playwright.isolated.config.ts` liga o reporter anti-skip, HTML/JSON/traces e `globalTeardown`. O reset é duplo: `globalTeardown` roda mesmo em falha e o job de CI tem um step `if: always()`. O `.env.e2e.generated` é efêmero e ignorado pelo Git.
- CI: job `isolated-e2e` em `.github/workflows/e2e.yml`, **sem nenhum segredo**. Resultado local: **7 testes, 7 executados, 0 ignorados**; health comprova 504 migrations e o marcador de isolamento; login inválido e ausência de JWT falham fechado. A suíte incorporou as duas verificações de `src/lib/testing/integration/workflow.test.ts` (tabela `idempotency_keys` e RPC `audit_stock_integrity`), que antes falavam com um Supabase externo via `.env` local e davam timeout como se fossem unitárias.

**Evidência publicada no GitHub (HEAD `d7af1dfb`, 05/11/2026):** run `CI` `42097855161` ✅ nos três jobs (Typecheck/lint/unitários e guardas RLS, Build de produção, Harness de banco); run `Playwright Tests` `42097855168` com **Smoke público obrigatório ✅** e **`Ambiente E2E isolado (QA-01)` ✅**, além de `Jornadas autenticadas obrigatórias` ❌ em `Validate isolated E2E configuration` — a mesma ausência de 19 segredos do baseline, **não regressão**. O job isolado, portanto, executa no runner do GitHub sem nenhum segredo e é reproduzível por terceiros.

**QA-02 — primeiro incremento (06/11/2026):** `tests/e2e/isolated-store-journey.spec.ts` roda no mesmo ambiente, sem nenhum segredo, elevando a suíte isolada de **7 para 10 testes**. Os IDs de empresa, produto e filiais são descobertos no boot e gravados em `.env.e2e.generated` — nunca fornecidos por variável de homologação. Os novos testes: (1) massa dos seeds consultável sob RLS real; (2) `create_supply_request` grava uma solicitação `PENDENTE`, a linha é relida por `GET` sob RLS e aparece em `factory_inbox` — **primeira escrita de negócio no ambiente isolado**; (3) `p_quantity: 0` é recusada e a contagem de solicitações não muda (fail-closed sem efeito colateral). `testMatch` do config isolado inclui o spec e o reporter anti-skip continua com `skip=0`.

**QA-02 — cadeia completa (07/11/2026):** `tests/e2e/isolated-store-chain.spec.ts` executa a jornada inteira sem segredos: pedido da loja → `factory_inbox` → decisão pelo CD → `APROVADA → RESERVADA → SEPARAÇÃO → CONFERÊNCIA → EXPEDIDA → EM TRÂNSITO` → recebimento de 4 de 5 → status `RECEBIDA COM DIVERGÊNCIA`, `divergence = 1` e **saldo da loja +4**. A suíte isolada vai a **11 testes, `skip=0`**. Para que a cadeia exista, o boot do servidor cria duas fixtures determinísticas: uma filial "Loja QA-02" distinta da Matriz (os seeds só criam a Matriz e `decide_supply_request` exige origem ≠ destino) e um saldo sem lote na origem (`apply_stock_movement_to_balance` casa saldo por lote; sem isso a expedição tentaria inserir quantidade negativa e o gate `estoque_negativo_proibido` barraria). Ambas vivem apenas no Postgres embarcado, são destruídas no teardown e **não** são dados de cliente nem massa fabricada pela suíte.

**Limite de escopo — ler antes de declarar QA-01/QA-02 concluídos:** QA-01 é o contrato de **infraestrutura** e QA-02 cobre a cadeia completa de abastecimento de lojas. Ainda **não rodam neste ambiente**: as jornadas de PCP/fiscal e os três golden paths `test.fixme` (produção, vendas, suprimentos), que seguem no job legado `authenticated` (19 segredos ausentes). Também não há segunda identidade por papel — a cadeia usa o administrador dos seeds para todas as transições; a separação loja vs. gestor, com massa por papel e por tenant, é trabalho de **QA-03**. A suíte também não usa navegador nem cobre telas; Chromium continua sendo pré-requisito para os specs de UI. `docs/E2E-Lojas.md` descreve abaixo o caminho antigo por `.bat`, que **não** foi alterado e continua exigindo confirmação manual do operador.

## Segurança: somente homologação isolada

A jornada transacional **cria solicitação e transferência, movimenta estoque e altera saldos**. Use uma instalação e banco separados da operação real. O script pede confirmação explícita, mas não consegue verificar se o banco realmente é isolado: a responsabilidade de conferir o destino é do operador. Em caso de dúvida, não execute. Não há limpeza automática; falhas intermediárias podem deixar registros e reservas. Repetições consomem saldo do CD.

## O que cada teste comprova

- `store-journey-ui.spec.ts`: login e abertura de três telas por papel. É um **smoke de interface**, não realiza a jornada completa com cliques.
- `store-journey.spec.ts`: solicitação, decisão, expedição, recebimento com divergência e saldo, por **API real**, com autenticação/RLS.
- `e2e/public/login.spec.ts`: cliques na tela de login e redirecionamento de rota protegida, sem backend; servidor dedicado e rede externa bloqueada. Não comprova autenticação real nem processos operacionais.

A jornada completa de solicitação → decisão → execução → recebimento **por cliques**, com verificação dos efeitos persistidos, ainda precisa ser implementada e executada. A suíte legada possui outras especificações que também dependem de credenciais e massa; não considerar testes ignorados como aprovados.

## Executar Lojas em homologação

1. Confira que aplicação e Supabase apontam exclusivamente para ambiente isolado, migrado e iniciado. Prepare manualmente usuários, produto com saldo suficiente e unidades de homologação. Os scripts de seed existentes alteram o banco: leia-os e use somente no banco isolado; o executor não os chama automaticamente.
2. Crie `.env.e2e` na raiz (não versionar, não compartilhar senhas) com os valores abaixo. Confirme especialmente que URLs do navegador e da API correspondem ao mesmo ambiente.
3. Rode `TESTAR-E2E.bat`, leia o aviso e digite `HOMOLOGACAO` apenas após conferir o isolamento. É necessário Bun, dependências e acesso para instalar Chromium na primeira vez. O script falha se variáveis estiverem ausentes, um teste for ignorado ou o Playwright falhar. O código de saída é propagado pelo `.bat`.
4. Guarde a saída e revise resíduos/saldos no ambiente de homologação. Um teste aprovado não é homologação de produção.

```dotenv
E2E_BASE_URL=http://localhost:8080
VITE_SUPABASE_URL=http://localhost:8080
VITE_SUPABASE_PUBLISHABLE_KEY=<chave anon do ambiente isolado>
E2E_STORE_EMAIL=<usuario da loja de homologacao>
E2E_STORE_PASSWORD=<senha>
E2E_MANAGER_EMAIL=<gestor de homologacao>
E2E_MANAGER_PASSWORD=<senha>
E2E_PRODUCT_ID=<produto com saldo suficiente no CD de homologacao>
E2E_STORE_BRANCH_ID=<unidade loja de homologacao>
E2E_CD_BRANCH_ID=<unidade CD de homologacao>
```

## Smoke offline de login

Na raiz: `bun install --frozen-lockfile`, `bun x playwright install chromium` e `bun x playwright test --config=e2e/playwright.public.config.ts`. No Linux podem ser necessárias bibliotecas de sistema do Chromium (`playwright install-deps chromium`). A porta 4179 deve estar livre. O teste usa backend inválido e intercepta requisições externas; não executa operações de banco. Não requer `.env.e2e`.

## Estado da validação (T101)

Os três testes offline passaram em Chromium neste sandbox (rota protegida, mostrar/ocultar senha e navegação de recuperação), sem autenticação nem banco. Os quatro testes de Lojas foram descobertos, mas o smoke autenticado e a jornada por API continuam **não executados** por falta de instalação e banco isolados. O smoke foi atualizado para abrir a Central de Abastecimento e clicar na aba Solicitar da Loja sem enviar. PowerShell/Windows e a instalação isolada do cliente não estavam disponíveis para validar o `.bat` de ponta a ponta.

O teste por API foi corrigido após confronto com as migrations: a decisão já cria transferência APROVADA e `shipped_qty` começa em zero. A sequência agora parte do estado seguinte e expede a quantidade solicitada; erros de leitura e IDs ausentes falham explicitamente. Essa correção ainda precisa de execução em homologação.
