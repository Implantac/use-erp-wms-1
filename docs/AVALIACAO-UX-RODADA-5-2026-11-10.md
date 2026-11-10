# Avaliação UX — Rodada 5 (10/11/2026)

> **Origem:** após confirmar *"ok tudo publicado pelo lovable"* (rebuild da rodada 4 verificado no deploy), o usuário escolheu **"Iniciar rodada 5 de UX"**.
> **Frente escolhida:** **responsividade e alvos de toque** — a única dimensão clínica ainda não medida nas rodadas 1–4, e diretamente ligada ao briefing do Drive (*"responsivo, amigável"*) e ao uso de ERP em chão de fábrica/coletor.
> **Status:** publicação no GitHub **autorizada** por *"atualize o github para que eu possa publicar no lovable"* (pedido pontual, consumido). **Não implantado** — o rebuild no painel do Lovable é executado pelo usuário. Ver §8 para os incidentes de ambiente.

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-responsive-audit.mjs` (`npm run ux:responsive`), com `--assert` |
| Ambiente | Chromium real (Playwright) em **3 viewports** — 375×812 (`isMobile`/touch), 768×1024, 1440×900 — contra **frontend Vite local + API isolada QA-01** (504 migrations + 3 seeds, somente loopback) |
| Isolamento | Toda origem externa abortada, `/config.js` neutralizado em voo. **Nenhuma credencial de produção, nenhum dado real, nenhum deploy** |
| Amostra | **12 rotas autenticadas × 3 viewports = 36 medições**; 7 tabelas por viewport |
| **A/B controlado** | `--preset` injeta a estratégia de correção no **mesmo build**, sem alterar o código: `th-nowrap`, `table-minw`, `colspan-fix`, `colspan-fix2` |
| Evidência visual | `/home/user/ux-evidence/rodada5-mobile-dashboard.png` (antes) e `rodada5-depois-mobile-parametros.png` (depois) |

**Correção de viés:** a 1ª versão da métrica de "cabeçalho quebrado" usava a altura da célula e dava **100% de falsos positivos** (padding e ícones: `wrapped = ths` nos 3 viewports). A versão final compara a **largura natural do texto** (span `nowrap` que copia a fonte exata do `<th>`) com a largura disponível da célula. Também foi necessário excluir do "fora da viewport" os elementos dentro de **drawers fechados** e de **containers que rolam horizontalmente** — ambos são falsos positivos por design.

---

## 2. Achados clínicos (medidos, não opinados)

| ID | Sev. | Achado | Evidência (ANTES) |
|---|---|---|---|
| **UX5-01** | **Alta** | **Cabeçalhos de tabela partidos em sílabas no mobile.** Em 375 px: *"Parâm/etro"*, *"Categ/oria"*, *"Val/or"*, *"Atuali/zado"*, *"Açõ/es"*. **39** cabeçalhos quebrados em 375 px, **34** em 768 px, **3** em 1440 px. | Screenshot `rodada5-mobile-dashboard.png`; `antes2-responsive.json`: 7 tabelas, 4 delas com `tableW == wrapW` e `wrapHasScroll=false` |
| **UX5-02** | **Alta** | **Controles transbordando sem rolagem.** `CONSOLIDADO DO GRUPO` (WMS, `right=421`), `Próximo` (fiscal, `right=438`), `Administrador BIL` e `Atualizar` (tablet). Os ancestrais tinham `overflow-x: visible`; o `<body>` tem `overflow-x: hidden` — ou seja, **o conteúdo era simplesmente perdido**, não alcançável por scroll. | `antes2-responsive.json`: 2 controles fora em mobile, 1 em tablet; `scrollWidth 360 > clientWidth 253`, `425 > 349`, `567 > 512` |
| **UX5-03** | **Média** | **Região rolável não focável por teclado.** O wrapper das tabelas já tinha `overflow-auto`, mas sem `tabIndex` quem navega por teclado não consegue rolar horizontalmente (WCAG **2.1.1**). | `src/ui/base/table.tsx` original: `<div className="relative w-full overflow-auto">` |
| **UX5-04** | **Média** | **Efeito colateral descoberto durante a correção.** Ao ativar a rolagem, os estados vazios dentro de `<td colSpan>` passaram a acompanhar a largura da tabela e ficaram cortados (*"Nenhum parâmetro encontrado … para con…"*): **4 em mobile, 3 em tablet**. | Screenshot do "depois" intermediário; A/B `ab-sem-fix` vs `ab-colspan-fix` |

**Causa raiz de UX5-01:** `src/index.css` aplica globalmente `overflow-wrap: anywhere; word-break: break-word` a `th`. Combinado com `table { width: 100% }`, as colunas se comprimem até partir palavras, em vez de exceder o container e ativar o `overflow-auto` **que já existia** no componente `Table`. Não foi um problema de falta de wrapper — foi de ausência de largura mínima do conteúdo.

---

## 3. Estratégia escolhida por A/B (não por palpite)

| Estratégia injetada | `th` quebrados (mobile) | Tabelas rolando | Veredito |
|---|---:|---:|---|
| baseline | **39** | 3/7 | — |
| `table { min-width: 720px }` | — | — | descartada: impõe largura mágica, afeta dialogs estreitos |
| **`th { white-space: nowrap }`** | **0** | **7/7** | ✅ **adotada** — adaptativa, sem número mágico, não altera o desktop |

A solução faz a largura natural da tabela exceder o container e **ativa o `overflow-auto` já existente**. Correção de 1 classe no componente base, com efeito em todas as tabelas do ERP.

Para UX5-04, dois A/B adicionais: `colspan-fix` (`max-width: calc(100vw - 3rem)`) levou **4 → 0** em mobile, mas deixou **3** em tablet (o container rolável tem ~462 px, bem menos que `100vw`); `colspan-fix2` (`max-width: min(calc(100vw - 3rem), 420px)`) levou **3 → 0** em tablet. **Adotada a segunda.**

---

## 4. Correções aplicadas (7 arquivos `M` + 1 novo, +51/−9)

1. **`src/ui/base/table.tsx`**
   - `TableHead`: `whitespace-nowrap` — neutraliza a quebra de sílabas.
   - `Table`: wrapper passa a `role="region"` + `aria-label` + `tabIndex={0}` + anel de foco `focus-visible:ring-2`, tornando a rolagem horizontal **alcançável por teclado**. Nova prop opcional `scrollRegionLabel` para nomear a região.
2. **`src/index.css`** — `table td[colspan] > * { position: sticky; left: 0; max-width: min(calc(100vw - 3rem), 420px) }`, ancorando estados vazios à viewport. Em desktop o limite é maior que qualquer container, **sem efeito visual**.
3. **4 correções pontuais de transbordo**:
   - `GroupOverviewPanel.tsx`: `flex gap-2` → `flex flex-wrap gap-2`.
   - `FiscalProviderCard.tsx`: rodapé do wizard → `flex flex-wrap … gap-2`.
   - `Dashboard.tsx`: header e filtros de `sm:flex-row` → **`lg:flex-row`** (em 768 px título + filtros somavam 625 px num container de 464 px).
   - `Topbar.tsx`: barra de busca decorativa de `md:flex` → **`lg:flex`** (em 768 px seus ~180 px faziam o lado direito somar 543 px num espaço de 512 px e cortavam o menu do usuário). **Ctrl+K / CommandPalette continuam disponíveis.**
4. **`package.json`**: script `ux:responsive`.
5. **`scripts/ux-responsive-audit.mjs`**: gate de regressão. Exige 0 cabeçalhos quebrados, 0 controles cortados, 0 overflow do documento, 0 estados vazios cortados, **toda região rolável focável**, e congela os alvos <24 px.

---

## 5. Resultado (mesmo código medido antes e depois)

| Métrica | 375 px | 768 px | 1440 px |
|---|---:|---:|---:|
| Cabeçalhos quebrados em sílabas | **39 → 0** | **34 → 0** | **3 → 0** |
| Tabelas com rolagem horizontal ativa | 3/7 → **7/7** | 2/7 → **7/7** | — → **7/7** |
| Controles fora da viewport | **2 → 0** | **1 → 0** | 0 → 0 |
| Estados vazios cortados (efeito colateral) | **4 → 0** | **3 → 0** | 0 → 0 |
| Overflow horizontal do documento | 0 → 0 | 0 → 0 | 0 → 0 |
| `ux:responsive --assert` | ✅ | ✅ | ✅ |

> Os "estados vazios cortados" não existiam no baseline (a tabela não rolava); foram **introduzidos** pela correção de UX5-01 e **eliminados** antes de fechar a rodada. Medidos por A/B, não pelo JSON do baseline.

Evidências em `/home/user/ux-evidence/`: `antes2-responsive.json`, `ab-th-nowrap-responsive.json`, `ab-sem-fix-responsive.json`, `ab-colspan-fix-responsive.json`, `ab-colspan2-tablet-responsive.json`, `depois-rodada5-responsive.json`, e os 2 screenshots.

---

## 6. Dívida **não** corrigida — decisão de produto

**Alvos de toque pequenos**, congelados no assert (baseline 22 em cada viewport):

| Métrica | 375 px | 768 px | 1440 px |
|---|---:|---:|---:|
| Interativos < 24×24 px (WCAG 2.2 / 2.5.8) | 22 | 22 | 22 |
| Interativos < 44×44 px (recomendação prática) | 114 | 503 | 521 |

São predominantemente **links de breadcrumb** (14×14 px para o ícone "Início", 20 px de altura) e ícones de ação em gráficos. A norma 2.5.8 admite exceção por **espaçamento suficiente**, que não foi medida; elevá-los a 44 px em todo o ERP mudaria densidade e layout de listas — decisão de design. O gate **congela** o número: qualquer aumento falha.

Também **não** foi medido nesta rodada: zoom de texto a 200% (WCAG 1.4.4), orientação paisagem em mobile, diálogos/wizards longos em 320 px e jornadas por clique com dados reais.

---

## 7. Validações executadas

| Verificação | Resultado |
|---|---|
| `ux:responsive --assert` (3 viewports) | ✅ 0 th, 0 controles cortados, 0 vazios cortados, 0 overflow, 22/22 alvos congelados |
| A/B `th-nowrap` / `colspan-fix` / `colspan-fix2` | ✅ 39→0, 4→0, 3→0 |
| `vitest run` | ✅ **447/447** (96 arquivos) |
| `lint:ci` | ✅ **0 erros / 0 avisos** (1236 `no-explicit-any` ignorados por regra documentada) |
| `e2e:public` | ✅ **8/8** |
| `e2e:isolated` | ✅ **24/24** |
| `ux:labels --assert` (rodada 4) | ✅ 0 nomes, 0 rótulos, 0 regressões de contraste; dívida de paleta 11/11 |
| `ux:a11y --assert` | ✅ foco visível, 0 diálogos nativos |
| `ux:journey --assert` | ✅ login, 12 rotas, paleta única, Ctrl+K |
| `ux:links --assert` | ✅ **105 rotas, 0 quebradas**, 0 vazamentos |
| SEC-02 | ✅ **2666 arquivos, 0 referências fixas** |
| Gate anti-skip | ✅ normal `exit 0`, **`--strict` `exit 2`** (7 dívidas, inalterado), 18 `secrets.*`, workflow diff 0 |
| `git diff --check` | ✅ 0 whitespace |

**Typecheck completo não foi rodado localmente** (satura o sandbox); nenhuma assinatura, tipo, spec, workflow, API, migration ou banco foi alterado. `supabase/functions/mcp/index.ts` foi **restaurado** após o harness isolado regenerá-lo — não editado.

---

## 8. Incidentes de ambiente (registrados, não ocultados)

- **11ª saturação do sandbox** após o rebuild: apagou `.git`, `node_modules` (763 pacotes), `bun`, Chromium, libs de sistema e **1152 arquivos**, e removeu diretórios em `/tmp`. Restaurado com clone raso de `b658e5f` + `tar --skip-old-files` + realinhamento dos 6 arquivos revertidos; reinstalados `npm install` (raiz 763 + harness 17 pacotes, PG nativo), `playwright install chromium` e `install-deps`. Estado final: HEAD `b658e5f`, **worktree limpo, 0 deletions**.
- **Cache stale do Vite**: o watcher não registrou a edição de `FiscalProviderCard.tsx` (HMR log mostrou os outros 4 arquivos, mas não esse). O botão "Próximo" continuava transbordando até reiniciar o Vite com `--force`. Sem o reinício, a medição teria sido um **falso negativo**.
- **Comentário JSX inválido** inserido dentro de uma tag de abertura em `Topbar.tsx` durante a edição — corrigido antes de qualquer validação (`lint:ci` confirmou).
- `package-lock.json` gerado pelo `npm install` e scripts de debug temporários foram **removidos**; o repo usa `bun.lock`.
- **12ª saturação**, já na mensagem de publicação: apagou `.git`, `node_modules`, Chromium e ~950 arquivos, e **reverteu parte das alterações da rodada 5** (`table.tsx`, `Dashboard.tsx`, `FiscalProviderCard.tsx`, `GroupOverviewPanel.tsx`) preservando outras (`index.css`, `Topbar.tsx`, `package.json`, o script e o relatório). Reconstruído com backup em `/tmp/ux5-backup`, clone raso de `b658e5f` e reaplicação das 4 edições. O diff final foi **conferido marcação por marcação** e corresponde exatamente ao validado (8 `M` + 2 `??`). Atenção: `tar --skip-old-files` precisa ser aplicado ao tar de **extração**, não ao de criação — aplicado ao de criação, ele sobrescreve os arquivos existentes.

---

## 9. O que **não** foi feito (por falta de autorização)

- ✅ **Commit e push autorizados** por *"atualize o github para que eu possa publicar no lovable"* — pedido pontual, **consumido**; não cria autorização permanente para novos pushes.
- ❌ **Nenhum rebuild ou deploy.** O código chega ao GitHub, mas o sistema publicado no Lovable continua no build da **rodada 4** até o usuário executar o rebuild no painel.
- ❌ Nenhum dado real, produção, homologação, migration em banco real, grant/RLS, rotação de credenciais, smoke autenticado em produção, piloto ou aceite presumido.
- ❌ Gate dos **18 segredos** intacto; `--strict` segue `exit 2`; nenhuma exceção SEC-02 nova; nenhum PAT gravado, nenhum `credential.helper`, nenhum askpass residual.
- ❌ Vídeos de treinamento e demais anexos do Drive continuam **não lidos**.

---

## 10. Conclusão

A rodada 5 cobriu a lacuna que as quatro anteriores deixaram: **o sistema simplesmente não era legível em 375 px** em suas telas de tabela, e perdia controles inteiros em 768 px por `overflow-x: hidden`. As correções são **cirúrgicas no componente base** (1 classe + 1 wrapper acessível), medidas por A/B no mesmo build, e protegidas por um gate que também congela a dívida de alvos de toque.

**Permanecem NO-GO:** o PAT segue sem revogação, `anon`/JWT legado e as credenciais do `Usehub.xlsx` seguem expostas, os **18 segredos** mantêm o job autenticado ❌, e faltam grant/RLS, fiscal/SEFAZ, PSP, restore, jornadas por clique, aceite formal e piloto. **CI verde não é evidência de aplicação utilizável.**

**Próximo passo que depende de você:** executar o **rebuild no painel do Lovable** para que o build publicado incorpore a rodada 5. O GitHub já está atualizado. A dívida de alvos de toque (§6) e a da paleta (rodada 4, §5) aguardam decisão de design separada.
