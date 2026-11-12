# Avaliação UX — Rodada 15 (11/11/2026)

> **Origem:** `"prossiga"` após a publicação da r14. Conforme o padrão das rodadas anteriores, autoriza **desenvolvimento local e leitura read-only**; **não** autoriza commit/push, rebuild/deploy pelo assistente, smoke autenticado em produção, dados reais nem aceite presumido.
> **Status atual:** **publicada com r16 em `271e484`**, por pedido pontual posterior ao desenvolvimento local sobre `d0b40b0`. CI do código aprovado; detalhes na [seção de publicação da r16](./AVALIACAO-UX-RODADA-16.md#0-publicação-autorizada-no-github). Sem novo rebuild confirmado no Lovable; última conferência conhecida do bundle contém r7–r13.
> **Frente escolhida:** r6 garantiu **foco** no primeiro campo inválido; r11–r14 garantiram **nome**, **árvore** e **idioma**. Faltava responder: **o erro está ligado ao campo?** (WCAG 1.3.1 / 3.3.1).
> **Ferramenta:** DOM real no Chromium + `ariaSnapshot()`. **Não** é escuta com NVDA/VoiceOver.
> **Série de arquivos:** mantém o sufixo `2026-11-10` por coerência com as rodadas 1–14.
> **Continuação:** os números e os 11 arquivos deste relatório são o estado ao encerrar a r15. A [rodada 16](./AVALIACAO-UX-RODADA-16.md) recuperou e revalidou esse lote após nova perda parcial, ampliou as melhorias e preservou r15+r16 em ZIP local com manifesto. Ambas foram posteriormente publicadas em `271e484`; o estado combinado, a revalidação e o CI estão no relatório da r16.

---

## 0. 20ª saturação

Ao iniciar, o workspace tinha **1728 arquivos**, `.git` **ausente**, deps/Chromium **0**. Como a r14 já estava publicada e não havia trabalho local novo, a reconstrução foi direta: clone raso público de **`d0b40b0`**, troca atômica do diretório (sem `tar`, sem sobreviventes para proteger), `npm install`, harness, `playwright install chromium` + `install-deps`. Nenhum arquivo da r14 foi perdido: `Fechar` e `ux:i18n` conferidos no clone. Toda a bateria de validação foi repetida **após** a reconstrução (§6).

---

## 1. Achado: UX15-01 — erro visível, mas desligado do campo

`FormField.tsx` já faz o certo (gera `id`, `<p role="alert">` e `aria-describedby`), mas **a maior parte dos formulários de negócio não o usa**. Medição após submit vazio em 5 jornadas:

| Jornada | Campos inválidos | Mensagens visíveis | O que acontecia |
|---|---:|---:|---|
| Novo Cliente | **4** | 4 | `<label>` + `<Input aria-invalid>` soltos; `<p class="text-destructive">` **sem `id`, sem `role`, sem `aria-describedby`**. A árvore mostrava `textbox "CNPJ *" [invalid]` e, separado, `paragraph: Documento obrigatório` |
| Novo Pedido de Compra | 1 | **0** | só `toastError('Selecione um fornecedor e ao menos um item com quantidade.')`; o `combobox [invalid]` não tinha descrição alguma |
| Receber pluma/fibra | 1 | **0** | só toast `role=alert` fora do diálogo; `combobox [invalid]` sem descrição |
| Novo Pedido de Venda | 0 | 0 | submit **desabilitado** com dica `role=status` (comportamento correto da r6) |
| Novo Apontamento | 0 | 0 | submit **desabilitado** com dica `role=status` (comportamento correto da r6) |

**Consequência:** quem navega por teclado/leitor de tela ouve o nome do campo e a marca `[invalid]`, mas **não o motivo da falha** — a mensagem está solta em outro nó da árvore (ou só no toast, que some). `ux:task` (r6) via o erro "acionável" e `ux:aria` (r12) via o papel vivo do banner: nenhum dos dois verificava a **ligação** campo↔erro.

---

## 2. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-errors-audit.mjs` (`npm run ux:errors`) com `--assert`, `--label`, `--out` |
| Cenário | login no isolado, abrir 5 diálogos, **submit vazio real**, espera 1,4 s, sonda o DOM e `ariaSnapshot()` |
| Métricas | campos com `aria-invalid="true"`; `aria-describedby` presente; descritor resolvendo para texto; descritor com papel vivo; mensagens de erro **soltas** (nenhum campo aponta para elas); mensagens com `role=alert`/`status` |
| Guardas anti-vício | só elementos-folha `p/span/small` com `text-destructive`/`text-red-`/`role=alert`; exclui asteriscos, texto < 4 chars, toasts `[data-sonner-*]`, dicas `[data-ux-hint]`; registra toasts **apenas como informativo** (não entra no gate) |
| Ambiente | API isolada QA-01 (504 migrations + 3 seeds, RLS real, só loopback), origens externas abortadas, `config.js` neutralizado |
| Evidências | `/home/user/ux-evidence/{antes-ab,depois}-errors.json` |

`--assert` exige 5 jornadas, ≥5 campos inválidos medidos (cobertura), zero campo sem descritor, zero descritor quebrado, zero descritor sem papel vivo, zero mensagem solta e ≥1 erro vivo. **Nenhum gate foi relaxado**; foi criado um novo.

---

## 3. Correções (posteriormente publicadas com r16)

### 3.1 Mecanismo generalizado — `src/ui/base/errorRef.ts`
Novo `fieldRef()` compõe `labelledRef` (r4/r6/r11) com `associateErrorFromDom()`. Quando `aria-invalid="true"`:

1. **respeita** `aria-describedby` explícito que já resolve para texto (`FormField`);
2. procura **uma única** mensagem de erro folha no mesmo container, subindo até 2 níveis (mesmo limite de `labelledRef`), **recusando containers com mais de um controle** — não liga o erro do campo vizinho;
3. garante `id` estável (`ux-err-N`), `role="alert"` e o token em `aria-describedby`;
4. **remove** os tokens que ele próprio criou quando o erro desaparece.

A função é recriada a cada render, então o React reavalia a associação sempre que `aria-invalid` ou a mensagem mudam. **Não inventa texto de erro**: onde só havia toast, o formulário passou a renderizar a mensagem inline.

Aplicado em `input.tsx`, `select.tsx` e `textarea.tsx` (substitui `labelledRef` por `fieldRef`; `labelledRef` e seus 7 testes permanecem intactos). `errorRef.test.ts` cobre 8 casos: associação simples, wrapper (CNPJ + botão), campo válido, contrato explícito, limpeza, preservação de dica, campo vizinho e asterisco/hint.

### 3.2 Mensagens inline onde só havia toast
| Arquivo | Antes → Depois |
|---|---|
| `src/pages/purchasing/PurchaseOrders.tsx` | `FormField label="Fornecedor" required` → passa `error="Selecione um fornecedor."` quando `createInvalidField === 'fornecedor'`; o próprio `FormField` gera `id` + `role=alert` + `aria-describedby` |
| `src/modules/wms/FiberReceiptDialog.tsx` | `SelectTrigger` de produto ganha `aria-describedby="fiber-receipt-product-error"` e `<p id=… role="alert" class="text-destructive">Selecione o produto de fibra/pluma recebido.</p>` |

O **toast continua** em ambos — a mensagem inline é adicional, não substitui o feedback existente. Nenhum comportamento de negócio, validação, RLS ou fluxo de persistência foi alterado.

---

## 4. A/B controlado

Mesmo script nos dois estados; no estado A, `git checkout --` nos **5 arquivos de produto** (os novos arquivos da r15 ficam presentes, mas não são importados pelo HEAD). 5 s de HMR entre estados.

| Estado | Inválidos | Sem descritor | Descritor quebrado | Sem papel vivo | Erros soltos | Erros vivos |
|---|---:|---:|---:|---:|---:|---:|
| **A — `d0b40b0` publicado** | 6 | **6** | 0 | **6** | **4** | **0** |
| **B — r15 local** | 6 | **0** | 0 | **0** | **0** | **6** |

```
[errors] 5 jornadas | controles=36 | invalidos=6 | semDescritor=0 |
descritorQuebrado=0 | semPapelVivo=0 | errosSoltos=0 |
errosVivos=6 | erros=0
UX ERRORS ASSERT OK: todo campo invalido aponta para uma mensagem de erro
viva e nenhuma mensagem fica solta.
```

Exemplo na árvore, antes e depois (Novo Cliente):

```
ANTES: - textbox "CNPJ *" [invalid]:      DEPOIS: - textbox "CNPJ *" [invalid] [describedby]:
       - paragraph: Documento obrigatório          - alert: Documento obrigatório
```

### Vieses evitados
- **Toast não é mensagem de campo:** instrumentei o probe para listar `role=alert`/`status` fora do diálogo *antes* de corrigir; sem isso, os 2 casos sem mensagem inline pareceriam "já resolvidos" ou seriam ignorados.
- **Dica de botão travado não é erro:** `novo-apontamento` e `novo-pedido-venda` têm `role=status` legítimo da r6; o gate não os conta como defeito.
- **`aria-invalid` sozinho não é correção:** o audit exige que o descritor resolva para texto e tenha papel vivo.
- **Sem mock de backend:** nenhum caminho feliz foi forçado; os formulários foram submetidos vazios contra a API isolada real.

---

## 5. Limitações declaradas

- **Nenhum leitor de tela real** (NVDA/VoiceOver). Medimos o DOM e a árvore do Chromium; pronúncia, ordem de leitura e anúncios dinâmicos reais não foram validados.
- O audit cobre **5 jornadas** e apenas a **aba ativa** de cada diálogo; `errorRef` foi desenhado para valer em todas, mas a medição é amostral.
- `npm run typecheck` completo morre por **SIGKILL/OOM** do `tsgo` no sandbox (não é erro de tipo); `tsc` dirigido aos 8 arquivos alterados passou.
- `validate-e2e-no-skip.mjs --strict` segue **exit 2** pelas 7 dívidas conhecidas; o gate normal é 0. Nada foi enfraquecido.
- No encerramento local da r15 não havia CI/build desse lote. Na publicação conjunta com r16 em `271e484`, **CI 43228461138 e build foram aprovados**; o Playwright autenticado continua bloqueado pelo gate dos 18 segredos. **Sem rebuild novo confirmado no Lovable**: última conferência conhecida do bundle é r7–r13.

---

## 6. Validação (toda repetida após a 20ª saturação)

| Verificação | Resultado |
|---|---|
| `ux:* --assert` (**17/17**, incluindo `ux:errors`) | ✅ todos verdes |
| `npm test` | **102 arquivos / 481 testes** ✅ (+1 arquivo, +8 testes de `errorRef`) |
| `npm run lint:ci` | **0 erros, 0 warnings** (1236 `no-explicit-any` por dívida conhecida) |
| `node --test scripts/e2e-isolated-lib.test.mjs` | **11/11** |
| `tsc` dirigido aos 8 arquivos TS alterados | **exit 0** |
| `e2e:public` / `e2e:isolated` | **8/8** e **24/24** ✅ |
| SEC-02 | **0 referências fixas** ✅ (2697 arquivos na bateria; 2698 na conferência final, já com os 2 relatórios) |
| Gate | **0** / `--strict` **2** (esperado) |
| `git diff --check` / `workflowDiff` / token versionado | **0 / 0 / 0** |

---

## 7. Higiene e estado

- Servidores `api-isolada-rodada-15-*` / `erp-frontend-rodada-15-*` **parados**; portas 4179/54321 livres.
- Removidos `.env.e2e.generated`, locks, `tests/harness/data*`, `e2e/test-results`, `playwright-report-isolated`, `/tmp/ux17-ab`; `supabase/functions/mcp/index.ts` restaurado (tooling o regenera).
- **Registro histórico ao encerrar a r15:** 11 arquivos locais (7 modificados + 4 novos), sem commit/push sobre `d0b40b0`. A r16 recuperou e ampliou o lote, posteriormente publicado em **`271e484`**; o estado atual está no relatório da r16.
- Nenhum token foi usado no desenvolvimento da r15. A publicação conjunta posterior usou o PAT fornecido no pedido específico. **Cinco PATs expostos**, somando este aos quatro anteriores, seguem pendentes de revogação; nenhum valor foi incluído nos arquivos versionados.

---

## 8. Próximos passos

1. **Publicação concluída:** r15+r16 em `271e484`, após pedido pontual posterior. Isso não autoriza futuras publicações nem deploy.
2. **Novo rebuild no Lovable pelo usuário** para aplicar r14–r16. Última conferência conhecida do bundle: r7–r13, sem nova leitura nesta publicação.
3. **Revogar os 5 PATs expostos** e rotacionar `anon`/JWT/`Usehub.xlsx` — ação do usuário.
4. **Leitor de tela real**, agora com erro associado para validar de fato o anúncio.
5. **Harness para JOINs 400**, mutações no gate de regressão e dívidas restantes. A r16 resolveu os alvos <24 px na amostra e os cortes em 320 px; zoom nativo de 200%, alvos de 44 px e catálogo completo continuam pendentes.
6. **Governança do NO-GO:** 18 segredos via secret manager, grant/RLS formal, smoke autenticado em produção, fiscal/SEFAZ, PSP, restore, piloto e aceite formal.

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && (cd tests/harness && npm install)
npx playwright install chromium && npx playwright install-deps chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npx vite --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:errors -- --label=depois --assert --out=/home/user/ux-evidence
```

---

## 10. Conclusão

A r14 respondeu **"o nome está em português?"**. A r15 perguntou **"e quando o formulário falha, o erro está ligado ao campo?"**. A resposta era não em 6 campos de 3 jornadas: 4 mensagens soltas em Novo Cliente e 2 campos inválidos cujo único feedback era um toast fora do diálogo.

Corrigido com um mecanismo de ref generalizado (respeita contratos explícitos, recusa ambiguidade, limpa a si próprio) e 2 mensagens inline, **sem tocar em validação, persistência ou gate**: `6/6/6/4/0 → 0/0/0/0/6`, com 17/17 audits, 481 testes e E2E 8/8 + 24/24 verdes.

O desenvolvimento descrito foi local e a publicação conjunta posterior foi feita em **`271e484`**. O parecer segue **NO-GO**: último bundle conferido contém r7–r13, sem novo rebuild confirmado, smoke autenticado, dados reais ou aceite. **CI verde e bundle presente não são evidência de aplicação utilizável.**
