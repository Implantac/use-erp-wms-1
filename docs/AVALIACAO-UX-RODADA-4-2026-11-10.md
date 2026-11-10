# Avaliação UX — Rodada 4 (10/11/2026)

> **Pedido:** *"lovable atualizado, prossiga com as melhorias"* — terceira confirmação de rebuild feito **no painel pelo usuário** (`index-BQGFwPFJ.js`, 14.234 bytes, 259 chunks com as strings da rodada 3).
> **Escopo desta rodada:** acessibilidade perceptível — **nomes acessíveis, rótulos de campos e contraste de texto**, medidos com Chromium real.
> **Status:** publicado no GitHub por autorização pontual (`"atualize o github"`) em `cb8c771` + fix corretivo. **Não implantado** — o rebuild no painel do Lovable continua sendo decisão do usuário. Ver §8 para o incidente de CI.

---

## 1. Metodologia (e o que ela não prova)

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-labels-audit.mjs` (`npm run ux:labels`), registrado no `package.json` |
| Ambiente | Chromium/Playwright contra **frontend Vite local** + **API isolada QA-01** (Postgres embarcado, 504 migrations + 3 seeds, somente loopback) |
| Isolamento | Toda origem externa abortada; `/config.js` neutralizado em voo; **nenhuma credencial de produção, nenhum dado real, nenhum deploy** |
| Amostra | **12 rotas**, 439 textos, 87 botões e 10 campos após login autenticado no isolado |
| Critério | **WCAG 2.1 AA**: razão ≥ 4.5:1 para texto normal, ≥ 3:1 para texto grande (≥24 px ou ≥18,66 px em negrito). Cálculo com fundo efetivo opaco subindo na árvore DOM |
| Nome acessível | `aria-label` → `title` → texto → `aria-labelledby`. **Placeholder NÃO conta** como rótulo |
| **A/B controlado** | `--override-muted=47` reinjeta **o token antigo no mesmo código**, medindo "antes" e "depois" com idêntica versão do app — elimina a diferença de build como variável |

**Limite declarado:** contraste e nome acessível são propriedades **computadas no browser**, não inferidas do código. A amostra cobre 12 rotas das 105 existentes; as demais não foram medidas nesta rodada. O isolado não implementa Edge Functions/Realtime — `404 /functions/v1/*` e `405 /rest/v1/*` são limitação do harness.

> ⚠️ **Primeira medição foi descartada.** Com `domcontentloaded` + 1,5 s, várias rotas exibiam apenas *"Carregando pedidos…"* e breadcrumb (17 botões, 0 campos, 81 textos). O script passou a esperar `#main-content` com >250 caracteres e sem o padrão de carregamento. Amostra final: **87 botões, 10 campos, 439 textos**. Esse viés está corrigido no código da auditoria.

---

## 2. Achados clínicos (medidos, não opinados)

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX4-01** | **Alta** | **`--muted-foreground` reprovava WCAG AA em todo o ERP.** `215 16% 47%` dava **4.27:1** sobre `--background` e **4.00:1** sobre `--muted` (exigido: 4.5:1). É o token de breadcrumbs, abas, labels, textos secundários e legendas — ou seja, o texto que o usuário mais lê para se orientar. | 55 dos 70 contrastes baixos tinham cor `rgb(101,117,139)`; exemplos: *"Módulos"*, *"Estratégico IA"*, *"Análises"*, *"Sincronização"*, *"Início"*, *"Comercial"* |
| **UX4-02** | **Alta** | **7 botões-ícone sem nome acessível.** Para leitor de tela eram anunciados apenas como *"botão"* — sem dizer o que faziam. Incluía o menu de ações de **cada cliente** e **cada pedido**, e o botão de *"Ver detalhes da OP"* repetido por linha. | `/comercial/clientes` 1, `/producao/ordens` 4, `/wms/dashboard` 2; ícones `ellipsis`, `eye`, `refresh-cw`, `filter` |
| **UX4-03** | **Alta** | **9 campos de busca sem rótulo associado** em 7 telas: só `placeholder`, sem `id`, sem `<label for>`, sem `aria-label`. Quem usa leitor de tela ouvia *"editar, em branco"* em *Clientes*, *Ordens de Produção*, *Apontamento*, *Pedidos de Compra*, *Recebimento*, *WMS*, *Parâmetros* e *NF-e* (2×). | `depois-ab-labels.json` → `unlabelledFields=9`, ex.: `"Buscar OP, produto, código ou cliente..."` |
| **UX4-04** | **Crítica** | **Amarelo da marca como texto chegava a 1.63:1.** `--warning: 45 100% 51%` (`#FFC105`) sobre fundo claro era usado em badges de prioridade *"Alta"*, status *"Pendente"*, alertas e KPIs. **131 ocorrências em 90 arquivos**. | `/producao/ordens`: *"Alta"* ×4 com razão **1.63**; `text-warning` em 93 arquivos / 135 ocorrências no total |
| **UX4-05** | **Média** | **Botão inerte.** Em `SmartReplenishment.tsx` havia `<Button size="icon"><Filter/></Button>` **sem `onClick`**: parecia um filtro, não fazia nada ao clicar. | `size="icon"`, ícone `filter`, nenhum handler; campo de busca ao lado já filtrava |

---

## 3. Correções aplicadas

1. **`src/index.css` — `--muted-foreground: 215 16% 47% → 215 16% 40%`.** Mesmo matiz e saturação; contraste passa a **5.55:1** sobre `--background` e **5.20:1** sobre `--muted`. Modo escuro **intacto** (`215 20% 72%` já dava 6.01:1 sobre o card escuro). Correção de 1 linha com efeito sistêmico em todo o ERP.
2. **`src/ui/base/input.tsx` — nome acessível derivado.** Quando o `Input` não tem `aria-label`, nem `aria-labelledby`, nem `id` (ou seja, **nenhum `<label for>` pode apontar para ele**), o componente deriva `aria-label` do `placeholder`. Inputs **com `id`** — inclusive os gerenciados por `FormField` (rodada 2) — **não** recebem o nome derivado, preservando a precedência do rótulo visível. Resolvidos os 9 campos de uma vez, sem tocar em 119 arquivos.
3. **`--warning-text` + `text-warning-text`.** Novo token `38 95% 32%` (**4.80:1**) no modo claro e `45 100% 65%` no escuro; registrado em `tailwind.config.ts` como `warning.text`. **`--warning` original foi preservado** para fundos, bordas e ícones decorativos — a cor da marca não mudou. Substituição mecânica `text-warning` → `text-warning-text` em **90 arquivos / 131 ocorrências**, com regex que preservou `text-warning-foreground` e variantes com opacidade (`text-warning/10`). Nenhum arquivo de teste foi alterado.
4. **7 nomes explícitos**, com contexto quando o botão se repete por linha: `Ações do cliente {nome}`, `Ações do pedido {número}`, `Ver detalhes da OP {número}`, `Pausar OP {número}`, `Atualizar sugestões de reposição` (+ `aria-busy`).
5. **Botão inerte removido** (não substituído por uma função inventada); import de `Filter` limpo. Total de botões 88 → 87.
6. **Gate de regressão novo**: `ux:labels --assert` exige **0 botões sem nome, 0 campos sem rótulo, 0 regressões de contraste** e congela a dívida de identidade visual (§5). **Prova de eficácia:** ao reinjetar `--muted-foreground: 47%`, o assert **falhou com 55 problemas** — ele detecta a regressão, não é um passe decorativo.

---

## 4. Resultado A/B (mesmo código, mesmo browser, só o token difere)

| Métrica (12 rotas) | ANTES (`--override-muted=47`) | DEPOIS | Δ |
|---|---:|---:|---|
| Botões sem nome acessível | **7** | **0** | −100% |
| Campos sem rótulo associado | **9** | **0** | −100% |
| Textos com contraste < WCAG AA | **70** | **11** | **−84%** |
| ├─ defeitos de `--muted-foreground` | 55 | 0 | −100% |
| ├─ defeitos de `--warning` (1.63:1) | 4 | 0 | −100% |
| └─ **dívida de identidade visual congelada** | 11 | 11 | sem piora |
| Pior razão medida | **1.63:1** | **2.30:1** | ↑ |
| Botões-ícone inertes | 1 | 0 | −100% |

Evidências em `/home/user/ux-evidence/`: `antes-ab-labels.json`, `depois-ab-labels.json`, `depois-labels.json`, `depois-assert-labels.json`, `regressao-ab-labels.json`, `antes-labels.json` (medição precoce descartada) e `r4-forms.json`, `r4-links.json`, `r4-a11y.json`, `r4-journey.json`.

---

## 5. Dívida **não** corrigida — decisão de produto necessária

Os **11 textos restantes** usam cores da paleta definida no briefing (`ERP_Prompt_Completo_com_Cores.pdf`: `accent #ff9800`) **como texto sobre fundo claro**:

| Cor | Razão | Onde |
|---|---:|---|
| `rgb(242,149,44)` — `--primary` (laranja) | **2.30:1** | legenda *"Faturamento"* e 6 links *"Ver todos os registros"* |
| `rgb(32,177,109)` — `--success` | 2.77:1 | *"4 OP(s) concluída(s) este mês"* |
| `rgb(32,148,243)` — `--info` | 3.19:1 | legenda *"Despesas"* |
| `rgb(168,85,247)` — roxo de gráfico | 3.96:1 | *"Aguardando checkout"* |
| `rgb(161,98,7)` — amber-800 | 4.48:1 | aviso de dados sensíveis (marginal) |

**Por que não foi mexido:** `text-primary` aparece **779 vezes em 372 arquivos**, `text-success` 185 em 101, `text-info` 37 em 28. Escurecer a paleta muda a identidade visual de todo o produto — é decisão de design, não uma correção técnica. A proposta está pronta (`--primary-text: 32 88% 35%` → **4.92:1**, e equivalentes para `success`/`info`), mas **não foi aplicada sem aval do usuário**.

O `--assert` **não esconde essa dívida**: congela exatamente as 5 cores e o limite de 11 ocorrências. Uma cor nova com contraste baixo, uma regressão dos tokens corrigidos ou qualquer aumento da dívida **falha o gate**.

> **Ressalva P2:** os 9 campos de busca agora têm nome acessível via `aria-label`, mas **ainda não têm rótulo visível** — o placeholder desaparece ao digitar. A solução é compatível com WCAG (nome Programático), porém o recomendado é `<label>` `sr-only` com texto estável. `ux:forms` continua medindo `paresValidos` por `<label for>` e, por isso, **não** registra melhora nessa métrica específica — não é regressão das rodadas 1/2.

---

## 6. Validações executadas

| Verificação | Resultado |
|---|---|
| `ux:labels --assert` | ✅ 0 nomes, 0 rótulos, 0 regressões; dívida congelada 11/11 |
| `ux:labels --assert` com token antigo (A/B) | ❌ **exit 1, 55 problemas** — gate detecta regressão |
| `lint:ci` (gate do CI) | ✅ **0 erros / 0 avisos** (1236 `no-explicit-any` ignorados por regra documentada de limpeza incremental) |
| `vitest run` | ✅ **447/447** em **96 arquivos** |
| `e2e:public` | ✅ **8/8** |
| `e2e:isolated` | ✅ **24/24** (9,0 s) |
| `ux:a11y --assert` | ✅ foco visível, **0 diálogos nativos** |
| `ux:journey --assert` | ✅ login, 12 rotas, paleta única, Ctrl+K |
| `ux:links --assert` | ✅ **105 rotas, 0 quebradas**, 0 vazamentos |
| `ux:forms` | ✅ sem regressão nos pares `FormField`/Enter |
| SEC-02 | ✅ **2664 arquivos, 0 referências fixas** |
| Gate anti-skip | ✅ normal `exit 0`; **`--strict` `exit 2`** (7 dívidas conhecidas, **inalterado**); `.test.mjs` 15/15 |
| `git diff --check` | ✅ 0 whitespace |
| Workflow / segredos | ✅ `.github/workflows/` **diff 0**, **18 `secrets.*`**, `E2E_REQUIRE_ALL: '1'` |
| `supabase/functions/mcp/index.ts` | ✅ restaurado após regeneração pelo harness; **não** editado |
| Resíduos | ✅ `tests/harness/data` e `.env.e2e.generated` removidos pelo teardown |

**Typecheck completo não foi rodado localmente:** historicamente satura o sandbox (960 s / `shell_error`) e já apagou arquivos. **O CI é o oráculo de tipos**; esta rodada não alterou assinaturas, tipos, specs, workflows, API, migrations nem banco.

**Alterações:** **104 arquivos** (102 `M` + 2 `??`), **+206 / −166** linhas versionadas, mais o relatório e o script de auditoria novos. O volume em arquivos vem da substituição mecânica de 1 token (`text-warning`); o conteúdo por arquivo é mínimo.

---

## 7. O que **não** foi feito (por falta de autorização)

- ✅ **Commit e push autorizados** por `"atualize o github"` (pedido pontual, consumido; **não** cria autorização permanente para novos pushes). HEAD/`origin/main` = `cb8c771` + fix corretivo (§8).
- ❌ **Nenhum rebuild, deploy ou publicação no Lovable.** O código está no GitHub, mas o sistema publicado pelo painel **ainda está no build da rodada 3** (`index-BQGFwPFJ.js`). Para o usuário final perceber a rodada 4, falta **um rebuild no painel**, que só o usuário executa.
- ❌ Nenhum dado real, produção, homologação, migration em banco real, grant/RLS, rotação automática de credenciais, smoke autenticado em produção, piloto ou aceite presumido.
- ❌ Gate dos **18 segredos** não foi alterado, reduzido ou burlado; `--strict` continua `exit 2`; nenhuma nova exceção SEC-02; `public/config.js` continua sendo a única.
- ❌ Nenhum PAT gravado, nenhum `credential.helper`, nenhum askpass persistido. O PAT usado em `24d34ac`/`f7e304b` (**4 usos no total**) segue **sem revogação** — rotação urgente, junto de `anon`/JWT legado e de **todas** as credenciais do `Usehub.xlsx`.
- ❌ Vídeos de treinamento e demais anexos do Drive continuam **não lidos**.

---

## 8. Incidente de CI e correção (pós-publicação)

O primeiro push (`f7e304b..cb8c771`, run **`42852212383`**) reprovou no step 5 **"Typecheck explícito e não vazio"**:

```
src/modules/commercial/orders/OrdersTable.tsx(88,50):
error TS2339: Property 'order_number' does not exist on type 'DbOrder'.
```

**Causa:** o `aria-label` de *"Ações do pedido …"* (UX4-02) usou `order.order_number`, mas o tipo `DbOrder` (`src/hooks/commercial/orders/types.ts`) expõe o campo **`number`**. A auditoria de nomes acessíveis roda no browser e não faz checagem de tipos; os 447 testes unitários e o `lint:ci` também não tipam. **O typecheck completo não é executado localmente** neste sandbox (historicamente satura e apaga arquivos) — o **CI é o oráculo de tipos**, como já registrado na rodada 3.

**Correção:** `order.number ?? order.id`, mantendo o nome acessível com contexto. Verificados os demais `aria-label` dinâmicos desta rodada: `client.name` existe em `DbClient`; `order.order_number` é válido nas OPs (`productionOrders/OrdersTable.tsx:48`). O log do CI continha **apenas esse 1 erro TS**.

Nenhum workflow, spec, gate, configuração de tipos ou exceção SEC-02 foi alterado para "curar" o CI.

**`Playwright Tests` (`42852212645`):** ❌ no job *"Jornadas autenticadas obrigatórias"*, step 4 *"Validate isolated E2E configuration"* — os **18 segredos** de sempre. Jobs *"Ambiente E2E isolado (QA-01 a QA-05)"* e *"Smoke público obrigatório"* ✅. Comportamento esperado, **não** é regressão da rodada 4.

---

## 9. Conclusão

A rodada 4 corrigiu o que o usuário **enxerga e o leitor de tela anuncia**: texto secundário abaixo do mínimo legal em todo o ERP, badges de prioridade praticamente ilegíveis (1.63:1), 7 botões sem nome, 9 buscas sem rótulo e 1 controle que não respondia ao clique. Tudo foi **medido antes e depois no mesmo build**, com gate de regressão que comprovadamente falha ao reintroduzir o defeito.

**Permanecem NO-GO:** `CI ✅` em `f7e304b` não é smoke autenticado nem evidência de aplicação utilizável — o job `Playwright Tests` segue ❌ no step 4 por exatamente **18 segredos ausentes**. Faltam decisão formal sobre grant/RLS, rotação de credenciais, 18 segredos via secret manager, G-01/G-02, fiscal/SEFAZ, PSP, restore, jornadas por clique, Playwright autenticado, aceite formal e piloto.

> **"CI verde não é evidência de aplicação utilizável."**

**Próximo passo que depende de você:** executar o **rebuild no painel do Lovable** para que o build publicado incorpore a rodada 4, e decidir sobre a dívida de paleta (§5). O GitHub já está atualizado.
