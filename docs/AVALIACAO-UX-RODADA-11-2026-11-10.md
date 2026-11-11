# Avaliação UX — Rodada 11 (11/11/2026)

> **Origem:** `"ok prossiga"` após a publicação de r7–r10. Frente escolhida no §8 do relatório r10: **UX9-04 / UX10-03** — o campo CEP herdava `aria-label="00000-000"` do *placeholder* em vez do rótulo visível **"CEP \*"**, e o `ux:task` (r6) considera qualquer `aria-label` como "nomeado".
> **Status:** **apenas local**. Sem commit/push — **7 arquivos** no worktree. `origin/main` segue em `a0b66e8` (r7–r10 publicadas). **Sem rebuild/deploy** — o rebuild no Lovable e a revogação do PAT continuam sendo ações do usuário e **não** foram autorizados por `"ok prossiga"`.
> **Série de arquivos:** mantém o sufixo `2026-11-10` por coerência com as rodadas 1–10, embora esta rodada tenha sido executada em 11/11.
>
> **Atualização (publicação de 11/11/2026):** publicada junto com a r12 no commit **`6af2036`** (`a0b66e8..6af2036`), a pedido expresso `"ok atualize o github e continue"`. CI **`43082340701` ✅ 3/3** (Typecheck, Build, lint/unit/RLS, Harness) — primeira validação de tipos e build sobre r11/r12. Playwright **`43082340738`**: smoke público ✅, E2E isolado ✅, jornadas autenticadas ❌ apenas no step 4 `Validate isolated E2E configuration` (18 segredos; mesma falha já registrada). **O texto abaixo preserva o estado local do momento da execução**; a publicação não implica rebuild no Lovable nem altera o **NO-GO**.

---

## 0. Incidente de ambiente: 16ª saturação

O workspace foi resetado **novamente** entre turnos: `.git`, `node_modules`, Chromium, libs de sistema e dependências do harness desapareceram (1720 arquivos). Desta vez a recuperação foi **muito mais simples**, porque r7–r10 já estavam publicadas:

| Etapa | Ação | Resultado |
|---|---|---|
| Restauração | `git clone --depth 1` de **`a0b66e8`** + `tar --exclude .git --skip-old-files` + cópia do `.git` raso | HEAD correto, **nenhuma reconstrução manual** de código necessária |
| Falso positivo evitado | 7 `src/shared/components/*` reapareceram como `M` em versão antiga (incluindo `PageLoading.tsx` pré-r8) | `git checkout --` nos 7: eram lixo da saturação, o HEAD já contém as versões publicadas |
| Ambiente | `npm install`, `npm install` no harness, `playwright install chromium`, `install-deps chromium` | deps=3, Chromium 158, 39 libs nativas do Postgres |
| Conferência | `PageLoading role=status`, `Clients preventDefault`, `ux:lifecycle` presentes | status **0**, código publicado íntegro |

---

## 1. Metodologia

| Item | Detalhe |
|---|---|
| Ferramenta nova | `scripts/ux-names-audit.mjs` (`npm run ux:names`) com `--assert`, `--label`, `--out` |
| Cobertura | **5 diálogos de negócio × todas as abas** (não só a aba inicial) — **42 campos** |
| O que mede | `aria-label`, `aria-labelledby`, `id`/`label[for]`, `placeholder`, **rótulo visível associável**, origem do nome (`data-ux-label-source`), `semNome`, `nomeDivergente`, `placeholderComoNome` |
| Normalização | remove acentos, `*` e espaços excedentes antes de comparar nome acessível × rótulo |
| Ambiente | Chromium 158 + API isolada QA-01 (504 migrations + 3 seeds, RLS real, só loopback), origens externas abortadas |
| Evidências | `/home/user/ux-evidence/{antes,antes-ab,depois}-names.json` |

**Correção de viés (registrada):** a 1ª versão do audit procurava o `<label>` apenas entre os irmãos do campo ou como filho direto do pai. Com isso **não enxergava o CEP**, que está dentro de `<div class="flex">` com o `<Label>` como irmão do *wrapper*. A heurística passou a subir **até 2 níveis** (e o `labelledRef` também). Resultado: o baseline passou de **6** para **8** divergentes — CNPJ e CEP estavam escondidos. **A dívida era maior do que a r9/r10 haviam medido.**

---

## 2. Achado clínico

| ID | Sev. | Achado |
|---|---|---|
| **UX11-01** | **Média** | **8 campos anunciados pelo placeholder, não pelo rótulo visível.** Leitor de tela ouve "00000-000", "00.000.000/0000-00", "(00) 0000-0000", "ISENTO ou número", "Nome do fornecedor" — em vez de "CEP", "CNPJ", "Telefone", "Inscrição Estadual", "Fornecedor". |

**Causa raiz:** a r4 (`Input`) deriva `aria-label` do `placeholder` quando não há `id`; a r6 (`labelledRef`) **deliberadamente não sobrescreve** nomes existentes — o comentário do próprio código dizia *"O `Input` derivado de `placeholder` também já chega com `aria-label` e portanto é ignorado aqui"*. As duas correções, cada uma correta no seu contexto, combinadas produziram o defeito. E o `ux:task` só checava **presença** de nome, nunca **qualidade**.

**ANTES (HEAD publicado `a0b66e8`, mesma heurística):**

| Diálogo / aba | `aria-label` | Rótulo visível |
|---|---|---|
| novo-cliente / Identificação | `00.000.000/0000-00` | CNPJ * |
| novo-cliente / Identificação | `(00) 0000-0000` | Telefone * |
| novo-cliente / Identificação | `(00) 00000-0000` | Celular / WhatsApp |
| novo-cliente / Endereço | `00000-000` | **CEP \*** |
| novo-cliente / Endereço | `Ex: Sul, Sudeste...` | Região |
| novo-cliente / Endereço | `Ex: Grande SP...` | Micro-Região |
| novo-cliente / Fiscal | `ISENTO ou número` | Inscrição Estadual |
| recebimento-fibra | `Nome do fornecedor` | Fornecedor * |

---

## 3. Correções implementadas

- **`src/ui/base/input.tsx`** — o nome derivado do placeholder agora é **marcado** com `data-ux-label-source="placeholder"`. `aria-label` escrito explicitamente pelo desenvolvedor **não** recebe a marcação e permanece intocável.
- **`src/ui/base/labelledRef.ts`** — `deriveLabelFromDom` pode substituir **apenas** o nome com origem `placeholder` pelo rótulo visível. A busca sobe até 2 níveis, para no primeiro outro controle (não herda rótulo de campo vizinho) e só aceita `label` filho direto quando o wrapper tem **no máximo um controle**. Sem rótulo visível, **mantém o placeholder** — a r4 continua valendo para campos que realmente não têm `<label>`. `aria-labelledby` e `id` (usados pelo `FormField`) seguem intocáveis.
- **`scripts/ux-names-audit.mjs`** usa **exatamente a mesma heurística**, para que medição e produto não divirjam.
- **`src/ui/base/labelledRef.test.ts`** — **6 testes**: nome explícito preservado; substituição pelo rótulo irmão; caso real do CEP com wrapper; placeholder mantido sem rótulo (r4); `aria-labelledby`/`id` respeitados; rótulo de campo vizinho **não** herdado.

**Contrato resultante:** `aria-label` explícito > `label[for]`/`FormField` > **rótulo visível** > placeholder. Cobertura genérica: qualquer tela futura com `<Label>` solto herda a correção sem alteração por página.

---

## 4. A/B controlado (mesmo ambiente, mesma heurística)

| Métrica (42 campos) | ANTES (`antes-ab`, HEAD publicado) | DEPOIS (`--assert`) |
|---|---:|---:|
| `nomeDivergente` | **8** | **0** |
| `placeholderComoNome` | **8** | **0** |
| `semNome` | 0 | **0** |
| Campos inspecionados | 42 | 42 |

A/B feito com **reversão temporária** de apenas `input.tsx` + `labelledRef.ts` para o HEAD publicado, sem tocar em mais nada. `UX NAMES ASSERT OK: todo campo e anunciado pelo rotulo visivel em todas as abas, sem placeholder como nome.`

---

## 5. Validações executadas

| Verificação | Resultado |
|---|---|
| `ux:names --assert` | ✅ exit 0 (A/B `antes-ab` → `depois`) |
| **11/11 audits `ux:* --assert`** | ✅ `ux:names`, `ux:task`, `ux:labels`, `ux:a11y`, `ux:lifecycle`, `ux:happy`, `ux:loading`, `ux:resilience`, `ux:journey`, `ux:links` (105 rotas/0 quebradas), `ux:responsive` (22 alvos congelados) |
| `npm test` (vitest) | ✅ **101 arquivos / 472 testes** (466 da r10 + 6) |
| `npm run lint:ci` | ✅ **0 erros, 0 avisos**, 1236 `no-explicit-any` (inalterado) |
| `npm run e2e:public` | ✅ **8/8** |
| `npm run e2e:isolated` | ✅ **24/24** |
| SEC-02 | ✅ **2688 arquivos / 0 referências fixas** (após restaurar `mcp/index.ts`, regenerado pelo harness) |
| Gate anti-skip | ✅ normal **exit 0** com as mesmas **7 dívidas**; `--strict` **exit 2** (por desenho) |
| `.github/workflows/e2e.yml` | ✅ **18 `secrets.*`**, **diff 0 linhas** |
| `git diff --check` | ✅ limpo |

O `ux:journey` passou na bateria em sequência desta vez (na r10 houve 1 flutuação em 4 execuções, já registrada). **Não executado:** `typecheck`/`build` locais e, sem push, nenhum CI rodou sobre r11 — **não declaramos typecheck verde para esta rodada**.

---

## 6. Limitações declaradas

- **Ainda não há leitor de tela real** (NVDA/VoiceOver): medimos o **nome acessível computado pelo DOM**, que é o contrato que os leitores consomem, mas não substitui escuta real.
- A associação rótulo↔campo continua sendo **heurística de DOM**, não semântica nativa. A correção definitiva seria `FormField` (`htmlFor` + `id`) em todos os formulários; a r11 escolheu a via global e genérica para cobrer telas futuras sem cirurgia em 5+ arquivos.
- Campos **sem** `<label>` visível mantêm o placeholder como nome (r4): são nomeados, mas o nome é menos descritivo. Fora do escopo desta rodada.
- Dados sintéticos, ambiente descartado no teardown; nenhuma produção, banco real ou credencial envolvida.
- **Dívidas congeladas, não mexidas:** 22 alvos < 24 px, 11 textos de paleta, zoom 200%, viewport 320 px, 7 dívidas do gate, 1236 `no-explicit-any`, 18 segredos do CI.

---

## 7. O que **não** foi feito

- **Sem commit, push, rebuild ou deploy.** `origin/main` = `a0b66e8`; a r11 são **7 arquivos locais** (4 modificados + 3 novos). Requer autorização pontual para publicar, como nas rodadas anteriores.
- **Sem rebuild no Lovable.** O deploy acessível ao usuário continua em r1–r6: **ainda não permite cadastrar cliente** (UX9-01) e **fecha a confirmação de exclusão antes do resultado** (UX10-01). As correções de r7–r10 estão no GitHub, não no ar.
- **Sem revogar/rotacionar o PAT** — ação do usuário, recomendação reiterada desde a r6 e mais urgente após a publicação.
- **Nenhuma alteração** em produção, migrations, grants, RLS de produção, gate ou workflow. **Sem smoke autenticado em produção, sem dados reais, sem aceite presumido.**
- **Não corrigido:** `docs/AVALIACAO-UX-RODADA-4-2026-11-10.md` ainda diz "falta rebuild" (r4 já publicada).

---

## 8. Próximos passos

1. **Publicar r11** — **feito** em `6af2036` (junto com a r12) após `"ok atualize o github e continue"`; falta **rebuild no Lovable pelo usuário** para que r7–r12 cheguem ao usuário final.
2. **Cobrir mutações no gate de regressão** — lacuna que deixou UX9-01 passar por 465 testes e 24 E2E. `ux:happy` e `ux:lifecycle` existem; decidir se entram no CI sem enfraquecer o gate.
3. **Leitor de tela real** (NVDA/VoiceOver) para validar o contrato de nomes e a hierarquia `role=alert`/`role=status` das r7/r8.
4. **Ampliar o caminho feliz** para Compras/WMS/Vendas quando o harness suportar JOINs (infraestrutura de teste).
5. **Zoom 200%, viewport 320 px e dívidas congeladas** (alvos < 24 px, paleta).
6. **Governança do NO-GO:** revogar PAT, `anon`/JWT legado e `Usehub.xlsx`; 18 segredos via secret manager; G-01/G-02; grant/RLS formal; fiscal/SEFAZ, PSP, restore; piloto e aceite formal.

---

## 9. Como reproduzir

```bash
cd /home/user/use-erp-implementation
npm install && (cd tests/harness && npm install)
npx playwright install chromium && npx playwright install-deps chromium
node scripts/e2e-isolated-server.mjs
VITE_SUPABASE_URL=http://127.0.0.1:1 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-test-key \
  npm run dev -- --host 0.0.0.0 --port 4179 --strictPort --force

npm run ux:names -- --label=depois --assert --out=/home/user/ux-evidence
npm test && npm run lint:ci
```

---

## 10. Conclusão

Duas correções isoladamente corretas — r4 (nome pelo placeholder) e r6 (não sobrescrever nomes) — combinaram-se para produzir um defeito de acessibilidade que o `ux:task` não podia ver, porque ele media **presença** de nome, não **fidelidade ao rótulo**. Ao corrigir a própria heurística de medição, o achado cresceu de 6 para **8 campos**, incluindo o CEP que motivou a rodada.

A r11 marca a **origem** do nome e faz o rótulo visível prevalecer, preservando nomes explícitos, `FormField` e o fallback da r4. A/B no mesmo ambiente: **8 → 0 divergentes**, `semNome=0` nos dois lados, com 6 testes de regressão (incluindo a guarda contra herdar rótulo de campo vizinho) e 11/11 audits verdes.

**7 arquivos locais, nada publicado** *(naquele momento; hoje em `6af2036`)*. O parecer técnico segue **NO-GO**. E o ponto que não muda: **CI verde não é evidência de aplicação utilizável** — o GitHub tem r7–r12, mas o sistema que o usuário acessa ainda não permite cadastrar cliente. O rebuild no Lovable é a única ação que fecha essa distância, e é do usuário.
