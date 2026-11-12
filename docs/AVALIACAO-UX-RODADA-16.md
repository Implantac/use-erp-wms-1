# Avaliação UX — Rodada 16

**Status: desenvolvimento local concluído; sem commit, push ou deploy.**

A continuação `"ok prossiga"` manteve o escopo local/isolado. A base permanece **`d0b40b0`** (`HEAD` e `origin/main` local); a r15 foi recuperada e revalidada antes desta rodada. Não houve leitura nova do Google Drive, uso de PAT, acesso a dados reais, smoke autenticado em produção ou aceite.

## Resultado em uma página

- **22 alvos menores que 24 px → 0, em cada um dos cinco viewports amostrados.**
- **3 controles cortados em 320 px → 0.**
- **Gestão de Usuários:** uma falha de consulta não provoca mais remontagem/retry contínuo. Há alerta local, sem lista vazia enganosa, e retry manual realmente clicável.
- **Banner global:** em uma etapa de diagnóstico, media **873 px de altura numa tela de 640 px** e encobria o retry local. Reorganizado no mobile: **170 px**, com clique normal validado pelo Chromium.
- Gate responsivo **mais estrito**: cinco viewports × 12 rotas, sem a tolerância antiga de 22 alvos pequenos e dois controles fora da viewport.
- **490 testes unitários**, **37 testes Node**, E2E **8/8 + 24/24**; os **18 audits UX** têm resultado final aprovado, com uma repetição serial de `ux:links` documentada abaixo.

**Não é declaração de conformidade integral WCAG, de zoom nativo validado, de leitor de tela real nem de funcionamento do cadastro de usuários no backend. Produção continua NO-GO.**

---

## 1. Recuperação da r15 — 21ª perda parcial do workspace

Na abertura havia **1729 arquivos**, sem `.git`, dependências ou Chromium. Sobreviveram cinco arquivos relevantes da r15: o audit de erros, seu relatório, o índice, `package.json` e `PurchaseOrders.tsx`. `errorRef.ts`, seus testes e parte dos componentes alterados estavam ausentes.

Procedimento executado:

1. Copiar os sobreviventes para backup antes de qualquer substituição.
2. Clone público raso em diretório separado, confirmado em **`d0b40b0`**; troca atômica dos diretórios, sem `tar`, `reset --hard` ou `git clean` sobre os sobreviventes.
3. Restaurar os cinco arquivos protegidos e reaplicar `errorRef`, seus oito testes, os refs de Input/Select/Textarea e a mensagem inline de recebimento de fibra.
4. Reinstalar dependências, harness e Chromium.
5. Revalidar **102 arquivos / 481 testes** e `ux:errors --assert`, antes de começar a r16. O audit preservou seis inválidos, zero associação ausente/quebrada, zero mensagem solta e seis erros vivos.

Para reduzir o risco de nova perda, o lote final r15+r16 também foi salvo como **um ZIP de fontes, patch e manifesto SHA-256**, fora da árvore do projeto (§8). Isso é backup local, não publicação.

---

## 2. Responsividade — o que foi medido e corrigido

### Amostra

Doze rotas conhecidas, em cinco tamanhos: **320×640**, **375×812**, **720×450**, **768×1024** e **1440×900**. São **60 combinações rota×viewport**, não 60 rotas distintas. Há pelo menos sete tabelas renderizadas em cada passagem.

**720×450 é reflow por redução do viewport CSS**, equivalente à metade de uma janela 1440×900. Não foi acionado zoom nativo do navegador, e `deviceScaleFactor` não é prova de zoom de 200%. Esse limite está no código e nos JSONs (`nativeBrowserZoom: false`).

### A/B final — mesmo audit nos dois estados

Estado A: `d0b40b0` + r15 local, sem as seis correções de produto da r16. Estado B: r15+r16. Durante a troca, os arquivos corrigidos ficaram protegidos por backup e restauração automática.

| Viewport | Alvos <24 px A → B | Controles fora A → B | Overflow horizontal A → B |
|---|---:|---:|---:|
| 320 px | **22 → 0** | **3 → 0** | 0 → 0 |
| 375 px | **22 → 0** | 0 → 0 | 0 → 0 |
| 720 px, reflow | **22 → 0** | 0 → 0 | 0 → 0 |
| 768 px | **22 → 0** | 0 → 0 | 0 → 0 |
| 1440 px | **22 → 0** | 0 → 0 | 0 → 0 |

Em B: zero cabeçalhos de tabela quebrados, zero estados vazios cortados e regiões horizontais roláveis com foco de teclado e papel de região.

### Causas e alterações mínimas

| Arquivo | Achado e correção |
|---|---|
| `src/ui/base/breadcrumb.tsx` | Os 22 alvos eram ocorrências de links de **breadcrumb**, não do menu lateral. Links de seção mediam 20 px de altura; o ícone de Início, 14×14 em telas estreitas. O componente base agora tem `min-h-6 min-w-6` (24 px), preservando nome, href, Slot e ref. |
| `src/modules/wms/components/SupplyInboxLinkCard.tsx` | Duas ocorrências do link longo “Abrir Central de Abastecimento” chegavam a x=336 em 320 px. O botão ocupa a linha no mobile e volta a largura automática a partir de `sm`. |
| `src/modules/fiscal/FiscalProviderCard.tsx` | “Próximo” chegava a x=342. O probe identificou **grupo de 305 px dentro de 246 px**, sem quebra. `min-w-0 max-w-full flex-wrap` permite empilhar os dois botões. Nenhuma ação de salvar/emissão foi executada. |

Uma hipótese inicial apontou para paginação, mas o DOM mostrou que era o wizard fiscal. **A alteração especulativa em `pagination.tsx` foi retirada.** Também não ficou alteração em `Breadcrumbs.tsx`: o ajuste do componente base basta.

---

## 3. Achado adicional: spinner/retry sem fim em Gestão de Usuários

O novo guard de cobertura recusou `/admin/usuarios`: o conteúdo principal era apenas o breadcrumb e um spinner. Isso **não foi contado como rota validada**.

### Separação entre harness e produto

- O servidor isolado **não implementa** `/functions/v1/admin-users`; seu 404 é limitação do harness, não prova de defeito no serviço de produção.
- A reação da UI à falha era um defeito reproduzível: `UsersPage`, `UsersTable`, `SectorAccessCard` e `UserDialog` observam a mesma query. Após o erro, a página montava os filhos; o novo observer disparava `retryOnMount`; a página voltava ao spinner, desmontava os filhos e reiniciava o ciclo.
- Para não depender do 404 do harness, o novo audit induz **somente HTTP 503 nessa função**. Login e demais chamadas continuam no isolado. Não há resposta de lista, sucesso forçado, backend inteiro mockado nem mutação de usuário.

### Correção

`src/hooks/system/useUsers.ts` expõe `refetch`, `isFetching` e `isRetrying`, sem alterar serviço, permissões ou política global de retry.

`src/modules/admin/Users.tsx` agora:

- anuncia o carregamento via `PageLoading`;
- trata o erro **antes de montar os filhos** que reabriam a consulta;
- mostra `role="alert"`, explicação em PT-BR e retry local;
- não mostra “Nenhum usuário encontrado”, botão de criação ou exportação enquanto a lista não pôde ser carregada;
- não expõe o texto técnico recebido do serviço.

### A/B com falha 503

| Medida | A, sem r16 | B, corrigido |
|---|---:|---:|
| Tentativas nos primeiros 6 s | **11** | **2**, inicial + um retry |
| Novas tentativas nos 3 s sem ação | **6** | **0** |
| Alerta local | não | sim |
| Spinner persistente | sim | não |
| Retry manual por clique normal | indisponível | **2 novas tentativas** |
| Repetição automática após o retry manual | ciclo contínuo | **0** |
| Exceções JS não tratadas | 0 | 0 |

O erro permanece erro após o retry induzido: **nenhum caminho feliz de usuários foi declarado**.

---

## 4. Banner global encobrindo a própria recuperação

Na primeira versão B, o loop já estava corrigido, mas o clique no retry local ainda falhava. Não foi usado `force: true`, clique por JavaScript ou CSS para esconder o banner.

O probe DOM mostrou, em 320×640:

- botão local em y=402–442;
- banner global de y=12 até **885**, com **873 px de altura**;
- `elementFromPoint` no centro do botão devolvendo o **banner**, não o botão.

Ícone, texto e ação disputavam uma única linha; o texto ficava estreito e fazia o banner crescer verticalmente. `BackendErrorBanner.tsx` agora separa o grupo ícone/texto e coloca a ação abaixo no mobile (`flex-col sm:flex-row`), sem retirar mensagem, alerta ou retry global.

Na versão final, o audit registra **170 px de altura**, banner dentro da viewport, hit-test do botão local correto e **clique Playwright normal efetuando de fato o retry**. A medição de 873 px pertence à etapa diagnóstica com o loop já corrigido; não ao estado A final, em que o loop fazia o banner oscilar.

---

## 5. Gates e testes novos — nenhum limite relaxado

### `ux:responsive`

`ux-responsive-lib.mjs` concentra o contrato puro, com **26 testes Node**. O `--assert` exige:

- cinco viewports exatos e 12 rotas únicas em cada um;
- dimensões CSS efetivas corretas e rota efetivamente visitada;
- conteúdo principal, título e controles presentes; erro de navegação não é ignorado;
- no mínimo sete tabelas por passagem;
- **zero** alvos <24 px, controles fora, overflow, cabeçalhos/estados vazios cortados e regiões roláveis sem foco/papel;
- nenhum preset CSS injetado para obter verde.

A tolerância anterior de **22 alvos pequenos e dois controles fora, apenas em 375 px, foi removida**.

**Correção de viés:** uma animação de conexão ou consulta em segundo plano não significa que a página inteira esteja bloqueada. O audit mantém contagem desses indicadores no JSON; distingue `PageLoading`/main ocupado e spinner sem título de conteúdo já renderizado. Os testes cobrem os dois casos.

**Erro explicitamente identificado:** como a Edge Function de usuários não existe no harness, essa rota é marcada `pageState: "backend-error"`, com alerta local obrigatório. Isso mede **geometria do estado de erro**, não uma lista de usuários funcional. Não é permitido atribuir essa classificação indiscriminadamente às demais rotas.

### `ux:users:error`

Novo `scripts/ux-users-error-audit.mjs`: 503 induzido, ação `list` apenas, duas tentativas por ciclo, observação sem ação, clique real no retry e nova observação. O gate também recusa banner fora da tela, botão encoberto, spinner persistente, vazio enganoso, vazamento técnico e exceção JS.

### Testes de componente

- `breadcrumb.test.tsx`: **4** testes de piso, Slot, ref e nome acessível.
- `Users.test.tsx`: **4** testes, com React Query real e falha unitária de serviço, incluindo observer secundário e retry limitado.
- `BackendErrorBanner.test.tsx`: **+1** teste do contrato de layout mobile.

JSDOM testa contratos, não dimensões reais. A geometria e o clique vêm do Chromium.

---

## 6. Validação final e falhas intermediárias preservadas

| Verificação | Resultado final |
|---|---|
| `ux:* --assert` | **18/18 aprovados**, incluindo os gates novos/reforçados; recheck serial de links descrito abaixo |
| Links do menu | **105 rotas**, zero quebradas, zero lentas na repetição serial |
| Unitários, `npm test -- --maxWorkers=1` | **104 arquivos / 490 testes**, exit 0; nenhuma exclusão adicionada |
| Node: lib do isolado + gate responsivo | **37/37**, exit 0 (11 + 26) |
| `lint:ci` | **0 erros / 0 warnings**, 1236 `no-explicit-any` históricos |
| `tsc` dirigido | **16 arquivos TS locais + setup de testes**, exit 0 |
| E2E público | **8/8**, exit 0 |
| E2E isolado | **24/24**, exit 0 |
| SEC-02 | **2704 arquivos / 0 referências fixas** na conferência final, já com a documentação |
| Gate E2E normal / `--strict` | **0 / 2**; sete dívidas conhecidas permanecem |
| Diff whitespace / workflows | zero erros / nenhum workflow alterado |

### O que falhou antes de passar

1. O guard de cobertura recusou a tela de usuários presa em spinner. A causa foi corrigida, não excluída do audit.
2. A primeira classificação considerou indicadores de fundo como página inteira carregando; foi corrigida por critérios explícitos e testes, sem alterar os limites geométricos.
3. O primeiro clique real de retry foi bloqueado pelo banner; o layout foi corrigido, sem forçar o clique.
4. Rodar os unitários junto dos audits sobrecarregou o sandbox: `ux:links` teve dez timeouts e a chamada dos unitários encerrou antes de capturar o exit, embora o log tenha chegado a 490 aprovados. **Não foram declarados verdes nesse estado.** Sem alterar timeout, gate ou cobertura, links foi repetido sozinho: 105/105. Depois, servidores parados e unitários em um worker: 104/490, exit 0.

O JSON da bateria preserva **17/18 na primeira passagem**, o recheck e o resultado efetivo 18/18. Não foi fabricada uma passagem única sem falhas.

**Não houve CI, build de produção ou typecheck global novo sobre r15/r16.** O typecheck executado foi o dirigido acima; os históricos de OOM do checker global continuam sendo limitação, não prova de ausência de erros no projeto inteiro.

---

## 7. Evidências reproduzíveis

Diretório `/home/user/ux-evidence/`:

- `r16-a-responsive.json` e `r16-b-responsive.json`: A/B final, cinco viewports completos;
- `r16-a-users-error.json` e `r16-b-users-error.json`: falha 503 e comportamento de retry;
- `r16-ab-exits.json`: A falha nos dois gates, B passa nos mesmos gates, com SHA-256 dos scripts usados;
- `r16-ux-suite.json`: primeira passagem e recheck serial;
- `r16-validation-core.json`, `r16-validation-e2e.json` e `r16-validation-hygiene.json`: resultados finais e integridade;
- `revalidado-r15-errors.json`: associação de erros após a recuperação;
- arquivos `inicial-r16-*` e probes: diagnóstico anterior ao A/B final; não substituem os resultados finais.

Para reproduzir, em terminais separados e **somente no ambiente isolado**:

```bash
npm install
(cd tests/harness && npm install)
npx playwright install chromium
npx playwright install-deps chromium

node scripts/e2e-isolated-server.mjs

VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npx vite --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:responsive -- --assert --label=repro-r16
npm run ux:users:error -- --assert --label=repro-r16
```

Não executar unitários pesados simultaneamente ao audit de 105 rotas neste sandbox.

---

## 8. Estado local e preservação

- **25 arquivos locais**, somando r15 e r16 (15 modificados + 10 novos, incluindo documentação). Nenhum commit, push ou alteração em workflows.
- Servidores parados; portas de frontend/API livres; removidos ambiente gerado, locks, dados temporários E2E, relatórios de execução e probe descartável. O arquivo MCP regenerado pelo tooling foi restaurado.
- Backup final: `/home/user/ux-evidence/rodadas-15-16-fontes-locais.zip`, com fontes completas dos 25 arquivos, patch dos versionados, base Git, manifesto SHA-256 e instruções de restauração. Não contém `.git`, dependências, dados de banco, `.env`, tokens ou credenciais.
- **Nenhum PAT foi usado nesta rodada.** Os quatro PATs expostos anteriormente continuam pendentes de revogação pelo responsável; não devem ser reenviados ou reutilizados.

## 9. Limites e próximos passos

1. **Publicação não autorizada por “prossiga”.** r15/r16 seguem locais. Publicação futura exige autorização pontual e autenticação segura; não enviar PAT exposto na conversa. Rebuild/deploy no Lovable continua a cargo do usuário.
2. Última conferência conhecida do bundle: r7–r13. Não houve nova leitura do deploy nesta rodada; r14 continua sem confirmação de novo rebuild.
3. Zoom **nativo** de 200%, ampliação apenas de texto e leitor de tela real continuam pendentes. Não se deve concluir conformidade integral a partir de reflow/DOM.
4. A amostra deixou de ter alvos <24 px, mas ainda há alvos abaixo de 44 px: **114/115/141/504/522 ocorrências** nos cinco viewports em B. Não foram auditadas todas as exceções por espaçamento da WCAG 2.5.8 nem todo o catálogo de rotas, diálogos e estados.
5. Gestão de Usuários foi validada em **falha**, não em listagem, convite, alteração de perfil ou exclusão. Edge Functions e JOINs no harness precisam de frente própria; não foram inventados dados nem alteradas permissões/RLS para obter verde.
6. Permanecem os bloqueios de governança e segurança: revogar os quatro PATs, rotação de credenciais expostas, 18 segredos via secret manager, grant/RLS formal, smoke autenticado autorizado, fiscal/SEFAZ, PSP, restore, piloto e aceite formal.

**Conclusão:** duas dívidas geométricas amostradas foram eliminadas, e a ampliação da cobertura revelou e corrigiu uma recuperação de erro que não era utilizável em mobile. O lote está preservado e validado localmente. **NO-GO permanece: CI verde e bundle presente não são evidência de aplicação utilizável.**
