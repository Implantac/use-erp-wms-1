# Avaliação UX — Rodada 6 (10/11/2026)

> **Origem:** `"siga para a rodada 6"` (após a rodada 5 publicada no GitHub em `543911e`). O escopo **não** foi especificado pelo usuário; o assistente escolheu a frente ainda não medida e registrada como lacuna na r5: **jornadas de negócio por clique**.
> **Frente:** abrir formulários reais com um clique, submeter vazios e medir **nome acessível**, **foco no primeiro campo inválido**, **mensagem acionável** e **vazamento de erro técnico**.
> **Status:** **publicado no GitHub** por autorização pontual `"Atualize o github"`: commit **`2ca213c3b28208b7e46971c79dca4325cd952701`**, push `543911e..2ca213c`, `origin/main` = HEAD confirmado por `git ls-remote`, worktree 0. **Sem rebuild/deploy** — o rebuild no Lovable é executado pelo usuário (ainda pendente inclusive para a r5). Autorização consumida por este push.

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-task-audit.mjs` (`npm run ux:task`), com `--label`, `--out` e `--assert` |
| Ambiente | Chromium 158 (Playwright) contra **frontend Vite local** + **API isolada QA-01** (Postgres embarcado :55445, 504 migrations + 3 seeds, API só em `127.0.0.1:54321`) |
| Isolamento | Toda origem externa abortada; `/config.js` substituído em voo para apontar à API isolada. **Nenhuma credencial de produção, nenhum dado real, nenhum deploy** |
| Amostra | **5 tarefas**: Novo Cliente, Novo Pedido (venda), Novo Apontamento, Novo Pedido (compra), Receber pluma/fibra. **29 campos** no total. Cada diálogo abriu com **1 clique** (141–407 ms no probe exploratório) |
| O que o script faz | Abre o formulário, conta campos sem nome acessível, clica no submit vazio, e mede para onde vai o foco, quais textos novos aparecem e se há erro técnico |
| Critério de nome | `aria-label`, `aria-labelledby`, `label[for]` ou `closest('label')`. **`placeholder` NÃO conta** — é dica, não nome |
| Critério de campo focável | Tags nativas **e** `role="combobox"|"textbox"|"spinbutton"|"slider"` (Radix `SelectTrigger` é `<button role="combobox">`) |
| Evidências | `/home/user/ux-evidence/{antes,antes2,ab-input-label,antes-dica,depois}-task.json` e `rodada6-probe.json` (probe exploratório, **não** é medição formal) |

**Correções de viés aplicadas durante a própria rodada** (registradas para não serem repetidas):

1. O 1º baseline apontou **1 jornada "sem erro acionável"**. Era **falso negativo do seletor**: o toast Sonner de compras não usava `.text-destructive`/`[role=alert]`. Passamos a comparar as **linhas de texto visíveis antes/depois do submit**. A mensagem existia: *"Selecione um fornecedor e ao menos um item com quantidade."*. Hipótese **refutada**.
2. O probe exploratório capturou `["*","*","*"]` e o parágrafo descritivo do Recebimento como "erros". São, respectivamente, **asteriscos de `FormField required`** e **texto explicativo do `Alert`**, não mensagens de erro. O audit final ignora linhas só de `*` e conta os asteriscos separadamente (**4**, estáveis e corretos).
3. A 1ª versão de `focusIsField` só aceitava `INPUT|SELECT|TEXTAREA` e marcou 2 jornadas como "sem foco no campo" **mesmo com o foco correto** no combobox "Selecione o fornecedor"/"Selecione o produto". A métrica foi corrigida, **não o produto**.
4. `placeholder` foi descartado como nome desde o início: a r4 já derivava `aria-label` dele para campos de busca, mas **formulários de negócio não têm `placeholder`** — contar "3 campos nomeados" no Novo Cliente teria sido um falso verde.

---

## 2. Achados clínicos (medidos, não opinados)

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX6-01** | **Alta** | **19 de 29 campos de negócio sem nome acessível.** Para leitor de tela, eram apenas *"editar, em branco"*. O pior caso era **Receber pluma/fibra: 16 de 17 campos anônimos**, incluindo produto, fornecedor, lote, peso e toda a classificação laboratorial. | `antes2-task.json`: `novo-cliente` 3/6, `recebimento-fibra` 16/17; `rodada6-probe.json` |
| **UX6-02** | **Alta** | **Submit vazio deixava o foco no botão em 3 de 3 jornadas clicáveis.** "Cadastrar Cliente", "Criar pedido" e "Registrar recebimento" mostravam erros em outro lugar da tela, mas o teclado continuava no botão — obrigando a tabular do início para achar o campo. | `antes2-task.json`: `focoCampo=false` nas 3; `focusDesc` = `BUTTON Cadastrar Cliente` / `BUTTON Criar pedido` / `BUTTON Registrar recebimento` |
| **UX6-03** | **Média** | **Botão desabilitado sem dizer o que falta.** "Iniciar" (Novo Apontamento) e "Próximo Passo" (wizard de venda) ficavam cinzas sem nenhuma explicação. O usuário não sabia se era carregamento, permissão ou campo pendente. | `antes-dica-task.json`: `submitTravadoSemDica=2`; `submitEnabled=false` em ambas |
| **UX6-04** | **Média** | **Validação sem endereço do campo.** `validateFiberReceipt` devolvia só uma `string`; o diálogo sabia **o que** estava errado, mas não **qual campo** marcar como `aria-invalid` nem para onde focar. | `src/lib/wms/fiberReceipt.ts` (versão `543911e`), `FiberReceiptDialog.tsx:142-147` |
| **Ponto positivo** | — | **0 erros técnicos** vazaram em todas as 5 jornadas; **todas as mensagens de erro existentes eram acionáveis e em português**; os 5 diálogos abriram com 1 clique. | `antes2-task.json`: `erroTecnico=0`, `semErroAcionavel=0` (após correção do seletor) |

**Causa raiz de UX6-01:** o projeto usa o padrão `<div><Label>Texto</Label><Input /></div>` **solto**, sem `htmlFor`/`id`. Radix `Label` não associa automaticamente, e o `Input` da r4 só derivava `aria-label` de `placeholder` **quando não havia `id`** — ou seja, cobria campos de busca, não formulários. `Textarea` não tinha nenhuma derivação.

---

## 3. Correções implementadas

### 3.1 Nomes acessíveis sem reescrever 29 campos
- **Novo** `src/ui/base/labelledRef.ts`: callback ref que procura o `<label>` irmão anterior (ou primeiro `<label>` filho do wrapper) e deriva `aria-label` dele. **Não sobrescreve** `aria-label`, `aria-labelledby` nem `id` explícitos — `FormField` e os rótulos visíveis mantêm precedência.
- `src/ui/base/input.tsx` e `src/ui/base/textarea.tsx` passam a compor o ref encaminhado com `labelledRef`. O `aria-label` derivado de `placeholder` (r4) foi preservado.

**A/B controlado:** medimos só com a correção no `Input`, antes de tocar em mais nada — **19 → 1** campo sem nome. O restante era o `<TEXTAREA>` de "Observações da classificação", o que motivou estender a solução ao `Textarea`. Resultado final **19 → 0** (`ab-input-label-task.json` → `depois-task.json`).

### 3.2 Foco no primeiro campo inválido
- **Novo** `src/ui/base/focusInvalid.ts`: `focusFirstInvalidField(container, field?)` escolhe, nesta ordem, o campo com `data-field` igual ao informado, o primeiro `[aria-invalid="true"]` na ordem do DOM ou o primeiro campo editável visível; foca e rola até ele. `scheduleFocusInvalid` espera um macrotask porque `setTab`/`setError` só renderizam depois do commit do React.
- `src/lib/wms/fiberReceipt.ts`: nova **única fonte de verdade** `fiberReceiptIssue()` / `fiberClassificationIssue()` devolvendo `{ field, message }`. `validateFiberReceipt()` e `validateFiberClassification()` mantêm **a mesma assinatura e as mesmas mensagens** — nenhum consumidor existente precisou mudar e os testes antigos continuam válidos.
- `src/modules/wms/FiberReceiptDialog.tsx`: usa o `field` da issue para marcar `aria-invalid` + `data-field` e agendar o foco; `FiberClassificationFields` e `OptionalNumberField` recebem a chave do campo inválido.
- `src/components/commercial/ClientFormDialog.tsx`: após `setTab` e o toast, agenda o foco; caso de **documento duplicado** foca `data-field="document"`. `IdentificationTab`/`AddressTab` ganharam `aria-invalid` nos 7 campos que já pintavam a borda de erro.
- `src/pages/purchasing/PurchaseOrders.tsx`: estado `createInvalidField`, `data-field` nos comboboxes de fornecedor/produto, `aria-invalid` e foco no campo que falta; a marca é limpa quando o usuário corrige ou fecha o diálogo.

### 3.3 Botões travados passaram a explicar
- `NewTimeEntryDialog.tsx`: `role="status"` lista **dinamicamente** os pendentes — *"Preencha Operador, Ordem de Produção, Operação / Etapa para iniciar o apontamento."*
- `OrderWizard.tsx`: `role="status"` por etapa — *"Selecione um cliente para avançar para os itens."*, *"Adicione ao menos um item com produto e quantidade para avançar."*, *"Selecione a forma de pagamento e a condição para avançar."*

### 3.4 Regressão automatizada
- `scripts/ux-task-audit.mjs` + script `ux:task` em `package.json`.
- `src/lib/wms/fiberReceipt.test.ts`: **+2 testes / 8 no arquivo**, cobrindo que `fiberReceiptIssue` nomeia o primeiro campo inválido (`product_id`, `supplier_name`, `lot_number`, `quantity_kg`, `net_weight_kg`), que a mensagem permanece idêntica à do `validateFiberReceipt`, e que os campos de classificação também são nomeados.

**Arquivos no commit `2ca213c`:** **17** (13 modificados + 4 novos), **+678/−74**. Novos: `scripts/ux-task-audit.mjs` (197 linhas), `src/ui/base/focusInvalid.ts` (62), `src/ui/base/labelledRef.ts` (48) e este relatório.

---

## 4. Resultado A/B (ANTES → DEPOIS)

| Métrica (5 jornadas, 29 campos) | ANTES | DEPOIS |
|---|---:|---:|
| Campos sem nome acessível | **19** | **0** |
| Submits vazios que não focam o campo inválido | **3** | **0** |
| Jornadas sem mensagem acionável | 0 (após corrigir o seletor) | **0** |
| Botões desabilitados sem dica do que falta | **2** | **0** |
| Erros técnicos expostos | 0 | **0** |
| Asteriscos `required` (não são erro) | 4 | 4 |
| Diálogos abertos com 1 clique | 5/5 | 5/5 |

`node scripts/ux-task-audit.mjs --label=depois --assert` → **exit 0**: *"nomes, foco no primeiro inválido, mensagens acionáveis e dica para botões travados em todas as jornadas."*

---

## 5. Validações executadas

| Verificação | Resultado |
|---|---|
| `npm run ux:task -- --assert` | ✅ exit 0 (0/0/0/0) |
| `ux:labels`, `ux:a11y`, `ux:journey`, `ux:links`, `ux:responsive` — todos `--assert` | ✅ exit 0; **105 rotas / 0 quebradas / 0 vazamentos**; responsividade 375/768/1440 sem `th` quebrados nem controles cortados |
| `npm test` (vitest) | ✅ **96 arquivos / 449 testes** (447 da r5 + 2 novos) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos** (1236 `no-explicit-any` pré-existentes ignorados pelo gate) |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` | ✅ **24/24** (teardown removeu dados e `.env` gerado) |
| SEC-02 `check-hardcoded-project-refs.mjs` | ✅ **2671 arquivos / 0 referências fixas** (após `git checkout -- supabase/functions/mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, `E2E_REQUIRE_ALL='1'`, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |
| Compilação Vite + browser | ✅ todos os módulos alterados carregaram via HMR e executaram sem erro de runtime |
| **CI do GitHub sobre `2ca213c`** | ✅ **`42900215336` — success**: `Typecheck, lint, unitários e guardas RLS`, `Build de produção`, `Harness de banco (replay + negócio)` (3/3 jobs) |
| **Playwright do GitHub sobre `2ca213c`** | ❌ **`42900215858` — failure**: `Smoke público obrigatório` ✅, `Ambiente E2E isolado` ✅, `Jornadas autenticadas obrigatórias` ❌ **apenas no step 4 `Validate isolated E2E configuration`** (os 18 segredos, mesma falha já registrada desde a r4) |

**Limitação local, superada pelo CI:** `npm run typecheck` (`tsgo`) e `npm run build` **excederam 600 s / 420 s** no sandbox e foram encerrados por timeout — comportamento já registrado em rodadas anteriores (OOM/lentidão), não regressão desta entrega. Após o push, **o CI executou Typecheck e Build de produção com sucesso** sobre exatamente este commit: a validação de tipos que faltava localmente foi concluída pelo oráculo remoto. A cobertura desta rodada é, portanto: typecheck + build de CI, lint, 449 testes unitários, 32 specs E2E locais, 6 audits de browser e compilação/execução Vite. **Não há correção de typecheck pendente.**

**Os jobs autenticados em produção seguem ❌**: o job `Jornadas autenticadas obrigatórias` não chegou a rodar testes — falhou na validação de configuração pelos 18 segredos. Não declaramos esse job verde.

---

## 6. O que **não** foi feito (e por quê)

- **Sem rebuild ou deploy.** A r6 foi **publicada no GitHub** por nova autorização pontual (`"Atualize o github"`): `2ca213c`, push `543911e..2ca213c`. Essa autorização está **consumida**. O rebuild no painel do Lovable **continua pendente e a cargo do usuário** — inclusive o da r5. Não houve verificação de deploy da r5 nem da r6; o deploy acessível hoje segue sendo o da r4.
- **Nenhuma alteração em produção, banco real, migrations, grants ou RLS**; nenhum dado de cliente; nenhuma credencial real; nenhum segredo/PAT/`.env` versionado. `.env.e2e.generated`, `tests/harness/data` e `tests/harness/package-lock.json` foram removidos; os 2 scripts de probe temporários da r6 foram apagados; servidores e Postgres isolados foram parados.
- **Gate dos 18 segredos, `E2E_REQUIRE_ALL`, specs, reporter e workflows intactos.** G-01/G-02 não corrigidos. `--strict` continua `exit 2`.
- **Sem smoke autenticado em produção, piloto ou aceite presumido.** O **NO-GO** do parecer técnico permanece: PAT ainda não revogado (8 usos anteriores + os pushes desta rodada), `anon`/JWT legado e credenciais do `Usehub.xlsx` ainda a rotacionar, grant/RLS formal pendente, 18 segredos ainda fora de secret manager. O token foi usado apenas de forma transitória via `GIT_ASKPASS` em `/tmp`, apagado após cada push; `.git/config` segue sem helper/token e **0 arquivos versionados** contêm o valor.
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px e 11 textos de paleta de identidade visual (r4/r5); 7 dívidas do gate anti-skip; 1236 `no-explicit-any` pré-existentes (inclui `OrderWizard.tsx` `items: formItems as any`, apenas deslocado de linha pelas edições — confirmado contra `git show HEAD`).
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild", embora a r4 já tenha sido publicada pelo usuário. Alteração documental fora do escopo, mantida sem pedido.
- **Sem nova leitura do Google Drive** nesta rodada (app conectado, mas não consultado).

---

## 7. Backlog priorizado

1. **Rebuild no Lovable** — a r6 já está no GitHub (`2ca213c`); falta o build no painel, a cargo do usuário, que também ainda não rebuildou a r5. Até lá, o deploy segue no comportamento da **r4**.
2. **Typecheck de CI** — ✅ concluído: o job `Typecheck, lint, unitários e guardas RLS` passou em `42900215336`. O timeout local do `tsgo` é limitação do sandbox, não do código.
3. **Leitor de tela real e teclado ponta a ponta** — o audit verifica o contrato ARIA no DOM, mas não substitui NVDA/VoiceOver nem teste com usuário em chão de fábrica.
4. **Ampliar a amostra** — 5 tarefas cobrem os módulos Comercial, Produção, Compras e WMS; faltam Fiscal, Financeiro, Qualidade, PCP e os fluxos de edição (não só criação).
5. **Dívidas congeladas** — 22 alvos < 24 px, 11 textos de paleta, zoom 200% e viewport de 320 px.
6. **Governança (bloqueante, fora de UX):** revogar/rotacionar PAT, `anon`/JWT legado e `Usehub.xlsx`; 18 segredos via secret manager; G-01/G-02; decisão formal do grant; fiscal/SEFAZ, PSP, restore, piloto e aceite formal com commit/ambiente/data/responsável.

---

## 8. Como reproduzir

Evidências em **`/home/user/ux-evidence/`**, fora do repositório.

```bash
cd /home/user/use-erp-implementation
npm install                                   # bun ausente; npm ci falha por bun.lock
npx playwright install chromium               # + install-deps, se faltarem libs
node scripts/e2e-isolated-server.mjs           # API :54321, gera .env.e2e.generated
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:task -- --label=depois --assert --out=/home/user/ux-evidence
npm test && npm run lint:ci
```

O audit **aborta toda origem externa** e substitui o `config.js` por um apontamento inerte/isolado. Nenhum script fala com Supabase ou Lovable reais.

---

## 9. Conclusão

A r5 provou que as telas **cabem**; a r6 prova que, ao **tentar trabalhar**, o sistema ainda não ajudava quem erra. Em 5 jornadas reais, 19 de 29 campos eram anônimos para leitor de tela, 3 submits deixavam o teclado preso no botão e 2 fluxos travavam sem explicação. As correções são cirúrgicas (dois utilitários de base + `aria-invalid`/`data-field` nos formulários), medidas por A/B e cobertas por 449 testes unitários, 32 specs E2E e 6 audits de browser — **sem tocar em segurança, banco, gate ou produção**.

**CI verde não é evidência de aplicação utilizável.** O CI de `2ca213c` está verde (inclusive Typecheck e Build), e ainda assim o Playwright autenticado segue ❌ pelos 18 segredos, o parecer técnico continua **NO-GO** e **nada disso está no sistema que o usuário acessa hoje**: o código está no GitHub, mas falta o rebuild no Lovable. Publicar não é implantar; implantar não é aceite.
