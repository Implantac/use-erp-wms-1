> **Registro de versionamento — 09/11/2026.** Este parecer foi publicado no
> repositório por decisão do responsável, após circular desde 05/11/2026 apenas
> como arquivo local em `/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md`.
> **O repositório é público**: o conteúdo abaixo, inclusive o veredito
> **NÃO RECOMENDADO / NO-GO**, passa a ser de leitura pública.
>
> **Única redação aplicada nesta cópia:** no achado **DD-08**, o identificador
> literal do projeto legado foi substituído por
> `<ref legado suprimido pelo gate SEC-02>`. O gate
> `scripts/check-hardcoded-project-refs.mjs` varre `docs/` e reprova esse
> literal em qualquer arquivo versionado. O DD-08 permanece integral em todos
> os outros campos; **o arquivo local original não foi alterado** e conserva o
> registro completo. Nenhum outro trecho foi removido, reescrito ou resumido —
> DD-01…DD-12 e o histórico de QA-01 a QA-07 seguem aqui na íntegra.
>
> **Cópia canônica a partir de agora:**
> `docs/AVALIACAO-TECNICA-ERP-2026-11-05.md`. O arquivo em `/home/user/`
> permanece como cópia de trabalho; ao atualizá-lo, sincronize esta cópia e
> repita o SEC-02. **Produção: NO-GO.**

---

# Avaliação técnica para aquisição — USE ERP / WMS

**Perspectiva:** empresa compradora avaliando um ERP confiável e funcional para operação real  
**Data:** 05/11/2026  
**Objeto avaliado:** `Implantac/use-erp-wms-1`, `main`, commit `5982a06422efdfac0d655f5e88d8b244ea496b74`  
**Código avaliado:** idêntico a `8a5dbb35` (o último commit contém apenas documentação)  
**Documentos de governança considerados:** [plano-mestre](use-erp-implementation/docs/PLANO-MESTRE-LOJAS-PCP-TEXTIL.md), [índice de planos](use-erp-implementation/docs/INDICE-PLANOS-LOJAS-PCP-TEXTIL.md), [resumo da revisão](REVISAO-PLANOS-LOJAS-PCP-TEXTIL-2026-11-05.md)  
**Natureza:** parecer técnico de due diligence. Não é auditoria de segurança certificada, parecer fiscal/jurídico nem laudo de performance.

---

## 1. Veredito

**NÃO RECOMENDADO para contrato de produção ou substituição de ERP em operação neste momento.**  
**Recomendável apenas como piloto assistido, em ambiente isolado, com dados de teste e aceite formal.**

O sistema tem engenharia de dados mais séria do que a média de projetos em estágio semelhante: ledger de estoque com imutabilidade, 147 pontos de idempotência, 1.614 políticas RLS, harness de banco que reaplica as migrations do zero e um CI que reprova gates vazios. Isso é base real, não protótipo.

Mas um ERP confiável não se define pela quantidade de código, e sim por **o que acontece quando algo dá errado** e por **prova de que o ciclo completo funciona com dados reais**. Nesses dois quesitos o produto ainda está em pré-homologação:

- os golden paths de venda, compra e produção são `test.fixme`;
- as jornadas autenticadas **nunca foram executadas** — o CI falha na validação de 19 variáveis de ambiente isolado;
- emissão fiscal devolve `fiscal_emission_not_homologated`;
- restauração de backup está explicitamente **NÃO HOMOLOGADA**;
- um indicador exibido ao gestor (`99,2`) é inventado quando não há base de dados;
- o ciclo intercompany por produção não fecha;
- há `.env` versionado e 33 funções privilegiadas sem `SET search_path`.

**Publicar o front-end no Lovable não altera este parecer.** Significa que há uma interface acessível; não significa que as 502 migrations foram aplicadas, que existe banco isolado, que RLS foi provada com identidades reais, que provedores fiscais/PSP foram homologados ou que houve piloto. Como comprador, trato "publicado" como **deploy de apresentação**, não como **GO operacional**.

---

## 2. O que um comprador pergunta — e o que o sistema responde hoje

| Pergunta da empresa | Resposta com evidência | Confiança |
| --- | --- | --- |
| "Se eu faturar um pedido, a NF-e sai?" | Não. `supabase/functions/nfe-emit/index.ts` retorna `fiscal_emission_not_homologated`. | ❌ Bloqueado |
| "Se um usuário da Loja A tentar ver a Loja B?" | Há RLS declarada (179 migrations, 1.614 policies) e ensaio A/B documentado, mas o E2E A/B nunca rodou em CI. | ⚠️ Declarado, não provado |
| "Se eu confiar no score da Central da Loja?" | Não deve: `getStockReliability` retorna `99,2` sem divergências, inclusive em falha de consulta; ranking vem da ordem da lista. | ❌ Induz erro |
| "Se a indústria produzir para a loja, o recebimento fecha?" | Não. `produce_intercompany_request` deixa `producao_solicitada`; `receive_intercompany_delivery` só aceita `aprovada` e não exige expedição nem limita quantidade. | ❌ Ciclo aberto |
| "Se o banco cair, em quanto tempo volto?" | Não há RTO/RPO medidos. `docs/BACKUP.md` declara **NÃO HOMOLOGADO** e restore não foi ensaiado. | ❌ Sem resposta |
| "Se duas pessoas confirmarem o mesmo recebimento?" | Há `FOR UPDATE` e idempotência em várias RPCs, mas o ciclo intercompany por produção não foi ensaiado nesse cenário. | ⚠️ Parcial |
| "O estoque é confiável?" | Ledger único (`stock_movements`, 50 migrations), trigger de imutabilidade e saldos derivados. É o ponto mais sólido do sistema. | ✅ Forte |
| "As previsões de IA são confiáveis?" | `PredictiveIntelligenceService` **lança erro** em vez de inventar demanda, confiança ou EOQ. Postura correta; funcionalidade inexistente. | ✅ Honesto / ❌ Indisponível |
| "O que eu realmente recebo hoje?" | Um núcleo de estoque, produção têxtil e lojas com provas automatizadas de regras — sem prova de uso ponta a ponta, sem fiscal, sem piloto. | ⚠️ Pré-homologação |

---

## 3. Inventário quantitativo da baseline

| Dimensão | Medição |
| --- | --- |
| Código de aplicação | 1.726 arquivos `.ts`/`.tsx` |
| Banco | 502 migrations; 179 com `ENABLE ROW LEVEL SECURITY`; 1.614 `CREATE POLICY` |
| Funções privilegiadas | 483 `SECURITY DEFINER`; 397 `REVOKE ... FROM PUBLIC/anon`; 6 `GRANT ... TO anon` |
| Integridade | 147 ocorrências de `idempotency_key`; 50 migrations referenciam `stock_movements`; trigger `enforce_stock_ledger_immutability` |
| Auditoria | 7 tabelas de audit (`security`, `financial`, `wms`, `system`, `credit`, `ai_prompt`, `lot_migration`) |
| Servidor | 63 diretórios de Edge Functions (fiscais, PSP, IA, NPS, WMS, PCP, LGPD) |
| Testes | 94 arquivos de teste unitário; 9 specs E2E; harness de banco com 244 asserções |
| Documentação | 104 arquivos Markdown em `docs/` |
| Dívida explícita | 316 ocorrências de `any`; 14 `console.log`; apenas 4 marcas `TODO/FIXME` (na prática, falsos positivos de "TODOS") |
| CI em `5982a064` | CI `42072238787` ✅ (unit, build, harness); Playwright `42072238728` ❌ (job autenticado) |

---

## 4. Pontos fortes — o que realmente vale

1. **Ledger e rastreabilidade.** Um único `stock_movements`, saldos derivados por trigger, imutabilidade forçada e genealogia por lote. Em ERP, estoque é a fonte da verdade; aqui ela é bem desenhada.
2. **Idempotência e atomicidade como regra, não exceção.** 147 chaves, `FOR UPDATE`, RPCs transacionais, replay e concorrência cobertos no harness. A correção P0-03 (OP intercompany criada e vinculada na mesma transação) é exemplo de engenharia correta.
3. **Isolamento levado a sério no desenho.** RLS em larga escala, revogações explícitas, `user_sector_access`, guards e ensaio A/B documentado.
4. **CI com gates anti-falso-positivo.** `git diff --exit-code` após testes/build/harness, asserção de resultado não vazio no smoke, falha explícita quando faltam segredos de E2E. É raro e valioso: o pipeline **reprova** sucesso vazio em vez de o fingir.
5. **Bloqueios honestos.** `nfe-emit` bloqueia emissão não homologada; `PredictiveIntelligenceService` recusa inventar previsões; `BACKUP.md` declara não homologado; portões de produção antigos dizem "NÃO LIBERADO". O sistema não finge ter o que não tem — o problema é que ainda não tem.
6. **Especialização têxtil real.** Fiação, malharia, tecelagem e tinturaria com perfis, receitas versionadas, ΔE/lab dip, rolos/peças e indicadores com denominador configurado.
7. **Governança documental recém-corrigida.** Plano-mestre canônico e índice de 101 documentos passaram a separar histórico, evidência datada e estado atual.

---

## 5. Achados críticos

| ID | Achado | Evidência | Impacto para a empresa | Severidade |
| --- | --- | --- | --- | --- |
| **DD-01** | Golden paths não executados | `sales`, `purchase`, `production-golden-path.spec.ts` usam `test.fixme`; 3 specs usam `test.skip(!configured)` | Não há prova de O2C, P2P ou PCP por navegador. Um ERP se compra pelo ciclo, não pela tela. | **Crítica** |
| **DD-02** | E2E autenticado nunca rodou | CI `42072238728`: falha em `Validate isolated E2E configuration` (18 segredos ausentes); mesmo padrão em `42060882594` | RLS, papéis e persistência não foram provados com identidades reais. | **Crítica** |
| **DD-03** | Fiscal e pagamentos bloqueados | `nfe-emit` → `fiscal_emission_not_homologated`; funções PSP/SEFAZ/webhook sem homologação | Sem NF-e/NFC-e, sem cobrança real e sem reconciliação, não é ERP de varejo/indústria. | **Crítica** |
| **DD-04** | Ciclo intercompany por produção aberto e recebimento sem lastro | `20261105150000` deixa `producao_solicitada`; `receive_intercompany_delivery` (migration `20261019220000`) exige só `aprovada`, não lê expedição nem limita `p_quantity` | Risco de over-receipt, entrada de estoque sem saída correspondente e divergência contábil entre CNPJs. | **Crítica** |
| **DD-05** | KPIs que mentem | `storeService`: `return 99.2` sem base; `health.score` usa `reliability`; ranking por `findIndex`; `openCashiers: 0`; `getOperationalAlerts` retorna `[]` em erro; 8 consultas ignoram `error` | Gestor toma decisão de reposição com número fabricado; falha de RLS/consulta aparece como "tudo bem". | **Alta** |
| **DD-06** | `.env` versionado | `git ls-files` confirma `.env` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` e chave publicável de 208 caracteres; `.gitignore` contém `.env`, mas o arquivo já estava rastreado | Higiene de configuração inadequada, acoplamento a projeto fixo e precedente perigoso para segredos futuros. Não é vazamento de chave privada — é falha de controle. | **Alta** |
| **DD-07** | 33 migrations com `SECURITY DEFINER` sem `SET search_path` (10 com `GRANT ... TO authenticated`) | Varredura case-insensitive em `supabase/migrations`; exemplos: `check_stock_availability`, `enforce_stock_ledger_immutability`, `request_lgpd_anonymization`, `on_movement_status_change` | Padrão conhecido de risco de `search_path` em funções privilegiadas. Exige correção e ensaio antes de multiempresa real. | **Alta** |
| **DD-08** | Chaves anon embutidas em migrations | 3 migrations contêm JWT `role=anon`, `ref=<ref legado suprimido pelo gate SEC-02>`, expiração longa, usadas em `Authorization: Bearer` e `anon_key text` | Código de banco acoplado a um projeto específico; reprodução em outro tenant/cliente pode apontar para o projeto errado. | **Média/Alta** |
| **DD-09** | Continuidade não comprovada | `BACKUP.md`: "NÃO HOMOLOGADO"; restore, cópia externa, rebuild/rollback de funções e máquina limpa pendentes (OPS-01) | Sem RPO/RTO medidos, não há como contratar SLA nem seguro de continuidade. | **Alta** |
| **DD-10** | Superfície grande não homologada | 63 Edge Functions, inclusive ~20 de IA/insights/CX/NPS; 6 `GRANT` a `anon` em tabelas de storefront (uma com `INSERT`) | Cada função é um contrato a validar; superfície anônima amplia vetores de abuso sem rate limit comprovado. | **Média** |
| **DD-11** | Documentação como substituto de evidência | 104 docs com 438/459/476/502 migrations e 94/104/125/165/233/244/297/430 testes | Auditoria e onboarding ficam caros; o comprador não consegue reproduzir "qual versão estava verde". | **Média** |
| **DD-12** | Dívida de tipagem não marcada | 316 `any`, 14 `console.log`, praticamente nenhum `TODO` real | Defeitos latentes em um sistema transacional; ausência de marcadores dificulta due diligence futura. | **Média** |

**Nota de precisão:** `.env.local.example` usa um único placeholder de 22 caracteres repetido em 12 variáveis (`POSTGRES_PASSWORD`, `JWT_SECRET`, `SERVICE_ROLE_KEY` etc.). É exemplo, não segredo real — mas incentiva segredos fracos se copiado sem revisão.

---

## 6. Maturidade por domínio

| Domínio | Avaliação | Comentário |
| --- | --- | --- |
| Integridade transacional / estoque | 🟢 4/5 | Maior ativo; lacuna LOJ-05/06 é de ciclo, não de ledger |
| Isolamento multitenant / RBAC | 🟡 3,5/5 | Desenho forte, prova E2E ausente, DD-07 pendente |
| Segurança de configuração e segredos | 🔴 2/5 | DD-06, DD-07, DD-08 |
| Cobertura funcional (compras/vendas/estoque/PCP/lojas) | 🟡 3,5/5 | Ampla, mas fiscal/financeiro/PSP bloqueados |
| Qualidade e evidência verificável | 🟡 3/5 | CI exemplar; golden paths e E2E autenticado inexistentes |
| Observabilidade e auditoria | 🟡 3,5/5 | Tabelas existem; trilha ponta a ponta e correlação não provadas |
| Backup / recuperação / rollback | 🔴 2/5 | Não homologado |
| Usabilidade e aceite de usuário | 🔴 2/5 | Sem teste moderado, sem piloto, sem dispositivo real |
| Governança documental | 🟡 2,5/5 | Plano canônico novo; 101 documentos históricos ainda divergentes |
| Release / deploy / ambientes | 🟡 2,5/5 | CI verde, mas "publicado" sem gates operacionais |
| Conformidade fiscal e LGPD | 🔴 2/5 | Funções existem; homologação e matriz fiscal por cliente ausentes |
| Honestidade de dados | 🟡 3/5 | IA honesta; KPIs de loja fabricados |

**Leitura executiva:** a média é puxada para baixo não por falta de funcionalidades, mas por **falta de prova e de controle operacional**. Para um comprador, isso é mais caro de corrigir do que escrever mais código.

---

## 7. Riscos de negócio e cláusulas de proteção sugeridas

| Risco | Consequência comercial | Proteção recomendada |
| --- | --- | --- |
| Indicador falso orientar reposição | Ruptura ou excesso de estoque, capital parado | Exigir que todo KPI sem base exiba "sem dados"; congelar decisões automáticas até QA-02 |
| Estoque intercompany sem lastro | Divergência entre CNPJs, escrituração inconsistente | Bloquear recebimento sem expedição e sem teto de quantidade (LOJ-06) |
| Falta de homologação fiscal | Impossibilidade de faturar; passivo regulatório | Condicionar qualquer go-live à matriz fiscal aprovada pela contabilidade e RTC por autorizador |
| Indisponibilidade sem restore ensaiado | Parada sem RTO conhecido | Exigir ensaio cronometrado em projeto isolado antes de assinar SLA |
| Ausência de piloto | Implantação com dados reais sem aceite | Piloto de 30 dias com massa de teste, critérios assinados e direito de reversão |

*São critérios comerciais/técnicos sugeridos, não aconselhamento jurídico.*

---

## 8. Plano de remediação exigido para mudar o veredito

Ordem vinculante, integrada ao plano-mestre (não reabre P0-02/P0-03):

| # | Pacote | Origem | Aceite que o comprador deve exigir |
| --- | --- | --- | --- |
| 1 | **LOJ-08** — KPIs honestos | DD-05 | Sem `99,2`/ranking artificial; erro propaga; "sem dados" explícito; testes unitários e tela conferindo com banco |
| 2 | **SEC-02** — higiene de segredos | DD-06/DD-08 | `.env` removido do índice do Git, `.env.example` sem valores, chaves externas em cofre, rotação das chaves do projeto antigo |
| 3 | **SEC-03** — `search_path` | DD-07 | `SET search_path` explícito nas 33 funções, com grants revalidados e ensaio de invocação |
| 4 | **LOJ-05/06** — ciclo intercompany | DD-04 | OP → pedido/reserva → expedição → recebimento parcial → encerramento; sem over-receipt; reconciliação e RLS |
| 5 | **QA-01** — ambiente E2E isolado | DD-02 | 18 segredos configurados em banco de homologação, massa determinística, limpeza e relatórios |
| 6 | **QA-02/03** — jornadas por cliques | DD-01 | Golden paths executados em Chromium, por papel, com efeitos persistidos; nenhum `fixme` no caminho crítico |
| 7 | **OPS-01** — continuidade | DD-09 | Restore cronometrado, RPO/RTO medidos, rebuild/rollback de funções, máquina limpa |
| 8 | **EXT-01** — fiscal, PSP e piloto | DD-03 | Homologação com autorizador/PSP, matriz fiscal por cliente, piloto assinado |
| 9 | **P1** — custo industrial, mapa de defeitos, OEE, UX por papel | Matriz §7 do plano | Após os gates acima; sem simulação de dados |

**Critério de mudança de veredito:** só passa a "recomendado com condições" quando 1–8 estiverem com evidência identificada por commit, ambiente, data e responsável, e o piloto tiver aceite formal. Até lá, **NO-GO**.

---

## 9. Recomendação final ao comitê de compra

O fornecedor demonstra competência em modelagem de dados e disciplina de CI, e foi transparente ao bloquear o que não está pronto. Isso justifica **continuar a avaliação**, não **contratar a operação**.

Recomendo:

1. **Não migrar dados reais nem desligar o ERP atual.**
2. Tratar o ambiente publicado no Lovable como **demonstração**, com dados exclusivamente de teste.
3. Firmar um **piloto assistido de 30 dias** com os gates 1–8 como critérios de aceite contratual, não como "roadmap do fornecedor".
4. Exigir, a cada entrega, evidência de execução (CI, traces, relatórios de restore, ata de homologação) e não contagens de testes em documentos.
5. Reavaliar este parecer após QA-02/QA-03 e o primeiro restore ensaiado.

**Classificação do produto em 05/11/2026:** *pré-homologação com núcleo transacional sólido e dívida operacional crítica.*

---

## 10. Limites desta avaliação

Inspeção estática e leitura dirigida de código, migrations, workflows e documentação na baseline indicada. Não houve execução de migrations em banco, E2E autenticado, teste de carga, pentest, auditoria de todas as 63 funções nem validação com dados de cliente. Uma run de CI verde prova os gates que ela executa — não prova os que estão `fixme`, `skip` ou dependentes de segredos ausentes. Conclusões devem ser relidas após cada mudança de baseline.

---

## 11. Atualização pós-parecer (mesma data)

Após a emissão deste parecer, duas frentes foram iniciadas:

| Item | Estado | Evidência |
| --- | --- | --- |
| **LOJ-08 / DD-05** | **Implementado** | `storeService.ts` sem `99,2`, sem ranking por posição e sem `openCashiers: 0`; ausência de base retorna `null`; erros de consulta/RLS propagam; tela exibe "Sem dados"; 11 testes novos; suíte **441/441**; lint **0 erros / 0 avisos**; typecheck escopado aprovado |
| **LOJ-05/06 / DD-04** | **Desenhado, não implementado** | `docs/DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md`: máquina de estados, 12 invariantes, 4 RPCs propostas, 15 cenários de teste e 7 decisões em aberto |
| **SEC-02 / DD-06, DD-08** | **Implementado em código; rotação pendente** | Ver §12: `.env` fora do índice, zero literais versionados, 4 jobs neutralizados, trigger fail-closed, gate estático no CI |
| **SEC-03 / DD-07** | **Implementado em código** | Ver §12: zero funções `SECURITY DEFINER` de `public` sem `search_path`, gate permanente no harness |
| **QA-01 / DD-01, DD-02** | **Infraestrutura implementada e executada; jornadas pendentes** | Ver §13: 5/5 sem `skip` em ambiente isolado real; job legado com 18 segredos e 3 `fixme` permanecem |
| **QA-02, QA-03, SEC-01, OPS-01, EXT-01** | **Ainda abertos** | Incorporados ao P0 do plano-mestre (§7.1) |

**O veredito da seção 1 não muda.** Corrigiram-se a honestidade de dados e, em código, a higiene de configuração; além disso, passou a existir um ambiente E2E isolado executável (§13). Permanecem os bloqueios de ciclo intercompany, evidência das jornadas, homologação fiscal/PSP, continuidade, rotação de chaves e aplicação/aceite em ambiente real. Produção segue **NO-GO**, e o ambiente publicado no Lovable continua sendo demonstração.

---

## 12. Remediação SEC-02 / SEC-03 (05/11/2026)

**Nota de precisão sobre DD-08:** a varredura inicial contou 3 migrations com JWT `anon`, mas a busca por identificador de projeto revelou uma superfície maior — **10 arquivos versionados** apontavam para o mesmo projeto legado (migrations, `supabase/config.toml`, `.lovable/mcp/manifest.json` e o bundle `supabase/functions/mcp/index.ts`). O DD-08 estava correto na natureza do risco e **subestimou a extensão**. A correção tratou a superfície inteira, não apenas os 3 arquivos.

| Frente | O que foi feito |
| --- | --- |
| **Versionamento** | `git rm --cached .env` (`D .env`, arquivo local preservado; `.gitignore` já o ignorava). Histórico Git **não** foi reescrito, para não romper CI e a sincronização com o Lovable. |
| **Literais** | JWTs `anon` removidos das 3 migrations; URLs fixas substituídas por `current_setting('app.settings.supabase_url', true)` nas demais. O bundle do MCP é gerado no build a partir de `src/lib/mcp/index.ts` e, sem `VITE_SUPABASE_PROJECT_ID`, usa `project-ref-unset` e deriva o *issuer* de `VITE_SUPABASE_URL`; `config.toml` e o manifesto também usam o placeholder. |
| **Runtime de banco** | 4 jobs `pg_cron` (`ai-brain-daily-autopilot`, `wms-intelligence-30min`, `wms-slotting-daily`, `alert-sla-warning`) neutralizados. `tg_notify_incident_email()` e as 3 funções ativas que ainda apontavam para o projeto legado foram reescritas para ler `app.settings.supabase_url` / `app.settings.supabase_anon_key` e **não disparar HTTP** sem configuração. |
| **`search_path`** | `20261105181100_security_definer_search_path.sql` varre `pg_proc` e aplica `SET search_path = public, pg_temp` a toda função `SECURITY DEFINER` de `public` sem configuração; reprova o replay se restar alguma. **Grants não foram alterados**, e migrations antigas não foram reescritas. |
| **Gates permanentes** | `scripts/check-hardcoded-project-refs.mjs` (novo step do CI) varre **2.623 arquivos** e reprova ref de projeto legado, JWT ou token fixo. O harness ganhou 5 asserções sobre o catálogo: nenhuma função ativa com o ref legado, nenhum definer sem `search_path`, nenhum `proconfig` nulo, `prosrc` do trigger sem credencial e comentário `Fail-closed`. |
| **Documentação** | `docs/ENVIRONMENT.md` §0: provisionamento por ambiente, rotação obrigatória, placeholder `project-ref-unset`, `app.settings.*` e comportamento fail-closed. `.env.example` com aviso de segurança. |

**Evidência local (sandbox, Postgres embarcado):** replay de **504 migrations**, **249 PASS / 0 FAIL** (baseline 244 PASS / 0 FAIL); suíte unitária **441/441** em 95 arquivos; lint **0 erros / 0 avisos**; `node --check` no bundle MCP e no script de gate; JSON do manifesto válido; `git diff --check` limpo.

**Ainda não feito — e por isso o veredito não muda:**

1. **Rotação das chaves do projeto legado e revogação do token GitHub compartilhado em texto.** Remover do índice não invalida o que esteve exposto no histórico; é ação do fornecedor/proprietário, fora do repositório.
2. **Aplicação das migrations em banco real.** Todo o ensaio ocorreu no Postgres embarcado do harness; nenhuma migration foi aplicada em produção ou homologação.
3. **Configuração por ambiente.** `app.settings.supabase_url`, `app.settings.supabase_anon_key`, `supabase link` com `project_id` real e rebuild do bundle MCP. Sem isso, notificações e OAuth do MCP falham fechados por desenho.
4. **Aceite formal.** Falta registro com commit, ambiente, data, responsável e evidência de execução com identidades reais — além de QA-01/02/03, SEC-01, OPS-01 e homologações fiscais/PSP.

**Regressões detectadas no CI e corrigidas em dois commits seguintes.** (1) Ao desrastrear `.env`, o job `unit` passou a falhar com `supabaseKey is required.`: `createClient` é avaliado na importação e a validação local não reproduzia o checkout limpo do runner. Correção: `test.env` inerte em `vitest.config.ts`, exclusão dos dois testes de integração que dependiam de backend externo e migração deles para a suíte isolada (§13). (2) `e2e.yml` tinha um `:` não quotado que invalidava o workflow inteiro (zero jobs). (3) O step `Build não altera fontes rastreadas` detectou que a edição manual do bundle MCP era sobrescrita pelo `vite build`; o artefato gerado (hash `492bfb62`, com `project-ref-unset`) passou a ser o versionado. Registro explícito para o comprador: **uma correção de segurança introduziu falhas de CI**, percebidas porque os workflows falharam — o que reforça a exigência de evidência por commit, não apenas por execução local.

**Conclusão:** SEC-02 e SEC-03 reduzem risco real e são verificáveis no repositório, mas são **correções de código**, não prova operacional. Para um comprador, continuam valendo as exigências de evidência da seção 10. **NO-GO mantido.**

---

## 13. QA-01 — ambiente E2E isolado (05/11/2026)

**O que mudou em relação a DD-01/DD-02.** A única suíte "autenticada" exigia 18 segredos de um Supabase de homologação externo e nunca executava; o próprio `docs/E2E-Lojas.md` admitia que o script não conseguia verificar o isolamento e não fazia limpeza. Agora existe um terceiro job de CI, `isolated-e2e`, que roda **sem nenhum segredo** e **sem nenhum `skip`**.

| Item | Evidência |
| --- | --- |
| Isolamento verificável | `scripts/e2e-isolated-server.mjs` sobe Postgres embarcado, reaplica **504 migrations + 3 seeds determinísticos**, cria `public.e2e_isolation_marker` e só escuta em `127.0.0.1`. `assertLoopback()` recusa qualquer outro host; o health reporta o marcador e a contagem de migrations. |
| Autenticação e RLS reais | `POST /auth/v1/token` valida `crypt()` contra `auth.users`; cada consulta executa sob `SET LOCAL ROLE authenticated` com `request.jwt.claims`. `profiles`, `products` e `factory_inbox` são lidos/chamados no banco real, não em fixtures. Ausência de JWT → 401; senha inválida → 400. |
| Repetibilidade e limpeza | Dados descartados e reconstruídos a cada boot; `globalTeardown` roda mesmo em falha; workflow tem step `if: always()`. `.env.e2e.generated` é efêmero e ignorado pelo Git. |
| Gates não vazios | `e2e/playwright.isolated.config.ts` sempre liga o reporter anti-skip. Resultado local: **7 testes, 7 executados, 0 ignorados, 0 falhas**; 8 testes unitários do transporte no job `unit`; typecheck escopado `exit 0`; lint **0/0**; suíte unitária **439/439** validada **sem `.env`**; harness **249/249**. |

**Evidência de CI no HEAD `d7af1dfb` (05/11/2026):** run `CI` `42097855161` ✅ com os três jobs verdes — Typecheck/lint/unitários e guardas RLS, Build de produção e Harness de banco. Run `Playwright Tests` `42097855168`: **Smoke público obrigatório ✅**, **`Ambiente E2E isolado (QA-01)` ✅** e `Jornadas autenticadas obrigatórias` ❌ em `Validate isolated E2E configuration` — a mesma ausência de 18 segredos do baseline, **não uma regressão**. O job isolado executa no runner do GitHub sem nenhum segredo, tornando a evidência reproduzível por terceiros.

**QA-02 — cadeia completa (07/11/2026):** `tests/e2e/isolated-store-chain.spec.ts` passou a executar, sem segredos e com SQL real sob RLS, a jornada inteira: pedido → `factory_inbox` → decisão pelo CD → `APROVADA/RESERVADA/SEPARAÇÃO/CONFERÊNCIA/EXPEDIDA/EM TRÂNSITO` → recebimento de 4 de 5 → `RECEBIDA COM DIVERGÊNCIA`, `divergence = 1` e saldo da loja **+4**. Suíte isolada: **11 passed (6.8s)** localmente com `bun 1.4.2` e `skip=0`. O boot ganhou duas fixtures determinísticas (filial "Loja QA-02" e saldo sem lote na origem), necessárias porque os seeds só criam a Matriz e porque `apply_stock_movement_to_balance` casa saldo por lote — sem elas o gate `estoque_negativo_proibido` barra a expedição. Ambas são destruídas no teardown e não são dados de cliente. **Limites:** a cadeia usa uma única identidade (admin dos seeds); PCP/fiscal, os 3 golden paths `test.fixme` e a separação loja vs. gestor seguem para QA-03. **NO-GO mantido.**

**Teste flaky descoberto pelo CI (07/11/2026):** `CI` `42319338944` falhou no step "Contrato do transporte E2E isolado (QA-01)" enquanto o job de jornadas isoladas passava. Causa: `verifyJwt(token.replace(/.$/, 'x'), SECRET)` trocava apenas o último caractere de uma assinatura HMAC-SHA256 em base64url (43 chars, 4 bits significativos + 2 de padding) — em algumas execuções os bytes decodificados permaneciam iguais e o HMAC continuava válido. Como o token contém `iat`, o resultado variava com o relógio: verde local, vermelho no runner. Corrigido adulterando o **payload** e mantendo a assinatura, o que garante divergência de HMAC sempre; **nenhuma mudança em código de produção e nenhum afrouxamento de gate**. Validado com 20/20 execuções e 11/11 na suíte isolada. Registro relevante para a due diligence: a própria suíte de guardas tinha um falso verde dependente de tempo.

**Evidência de CI do QA-03 (07/11/2026):** HEAD `c998e55` → `CI` `42324642276` ✅ nos três jobs (typecheck/lint/unitários e guardas, build, harness); `Playwright` `42324642296` com smoke público ✅, **`Ambiente E2E isolado (QA-01/QA-02/QA-03)` ✅** e autenticado ❌ no step 4 pelos 18 segredos. Log do job `128256984654`: 504 migrations + 3 seeds e **18 passed (8.5s)**, `skip=0`. Localmente: 18 passed (9.2s), 10/10 testes unitários do transporte, SEC-02 2.632 arquivos / 0 referências fixas, lint 0/0, YAML e `diff --check` OK. Aplicação publicada segue HTTP 200 e não foi alterada. **NO-GO mantido.**

**QA-03 — papéis e golden paths (07/11/2026):** a suíte isolada passa de 11 para **18 testes, `skip=0`**. O boot cria uma segunda identidade real (`loja-qa03@useerp.test`: `auth.users` + `auth.identities` + `profiles` na Loja QA-02 + `user_roles` com apenas `operator`). `isolated-role-separation.spec.ts` prova, com `auth.uid()` e RLS reais, que o operador cria a solicitação mas é barrado (`42501`) em `factory_inbox()`, `decide_supply_request()` e na aprovação de transferência; o gestor decide/aprova; `created_by` ≠ `decided_by`; a tentativa negada não altera o status. A cadeia QA-02 foi refatorada para loja pedir/receber e gestor analisar/decidir/aprovar.

Os três `test.fixme` foram convertidos em jornadas reais e passam a rodar **exclusivamente** no config isolado; `testIgnore` no config autenticado impede apontá-los para homologação/produção. O transporte ganhou `POST`/`PATCH /rest/v1/<tabela>` (`buildInsertQuery`/`buildUpdateQuery`, 10 testes unitários), sempre sob `SET LOCAL ROLE authenticated`, com **UPDATE sem filtro recusado por fail-closed**. Cobertura: Compras (MRP → PC + itens → recebimento → `accounts_payable`, idempotência), Vendas (pedido + item → confirmação → `accounts_receivable`, idempotência) e PCP (OP com roteiro/snapshot, reserva por lote, qualidade aprovada, barreira de conclusão, ledger `PROD-*`).

**Evidência de CI do QA-04 (07/11/2026):** HEAD `34b4d9c` → `CI` `42327100670` ✅ nos três jobs; `Playwright` `42327100673` com smoke público ✅, **`Ambiente E2E isolado (QA-01/QA-02/QA-03/QA-04)` ✅** e autenticado ❌ no step 4 pelos **18** segredos (gate intacto, comportamento esperado). Log do job `128264793323`: 504 migrations + 3 seeds e **22 passed (9.7s)**, `skip=0`. Localmente: 22 passed (12.2s), 10/10 unitários, SEC-02 2.635 arquivos / 0 referências fixas, YAML e `diff --check` OK. Aplicação publicada segue HTTP 200 e não foi alterada. **NO-GO mantido.**

**Evidência de CI do QA-05 (07/11/2026):** HEAD `f5555e2` → `CI` `42327963694` ✅ nos três jobs; `Playwright` `42327963567` com smoke público ✅, **`Ambiente E2E isolado (QA-01 a QA-05)` ✅** e autenticado ❌ no step 4 pelos 18 segredos (gate intacto). Log do job `128267583622`: 504 migrations + 3 seeds e **24 passed (9.7s)**, `skip=0`, com os 2 testes do achado de RLS verdes. Localmente: 24 passed (10.5s), 5/5 testes do pré-voo + 10/10 do transporte, SEC-02 2.638 arquivos / 0 referências fixas, YAML e `diff --check` OK. Aplicação publicada segue HTTP 200, sem deploy adicional. **NO-GO mantido.**

**QA-06 — homologação como código (proposta) e ADR do grant (07/11/2026):** duas frentes **sem segredo, sem Docker, sem migration e sem alteração de gate**. (a) O repositório **já tinha** `docker-compose.local.yml` com Supabase self-hosted completo (db, auth, rest, realtime, storage, imgproxy, functions, migrate, web), `Dockerfile.local` e o entrypoint que reescreve `/config.js`. Em vez de criar uma stack paralela, esta rodada **auditou** o que existe: `infra/homologacao/docker-compose.homologacao.yml` é um **overlay** que corrige `0.0.0.0:8080` → `127.0.0.1` com `!reset` (porque `ports` é opção **concatenada** no Compose — acrescentar a porta de loopback deixaria as duas ativas), elimina a tag `:latest`, troca `restart: unless-stopped` por `"no"`, exige `ANON_KEY` com `${VAR:?}` e tira `studio`/`meta` do perfil padrão. Completam a proposta o `bootstrap.sh` **não executado** (pré-voo, `config -q`, 504 migrations, 3 seeds, `E2E_REQUIRE_ALL=1`, `trap … EXIT` com `down -v`), o `homologacao.env.example` com apenas os **18 nomes** e `scripts/validate-homologacao-compose.mjs` com **14 testes**. Documento de auditoria A-01…A-08 em `infra/homologacao/README.md`. **Nenhum container foi criado**: o sandbox não tem Docker; isto é proposta revisável, não ambiente funcional. (b) `docs/ADR-QA05-GRANT-REWORK.md` registra 4 opções para o achado de RLS, plano de teste e decisão pendente.

**Achado técnico novo do QA-06:** `GRANT UPDATE ON production_rework_orders TO authenticated` **isolado produz falso verde**. A tabela tem RLS habilitado e **nenhuma policy `FOR UPDATE`**: com o grant, o `UPDATE` interno do trigger deixa de dar `permission denied`, mas o RLS devolve **zero linhas** — o trigger termina sem erro e **sem sincronizar** `status` entre a OP e o registro de reprocesso. Uma falha visível viraria inconsistência silenciosa. Para funcionar seria preciso criar também uma policy `FOR UPDATE`, abrindo escrita direta de `status`/`quantity`/`reason` a qualquer autenticado do tenant e burlando a idempotência das RPCs. Registro complementar: as RPCs oficiais funcionam porque são `SECURITY DEFINER` e os triggers disparados dentro delas herdam esse contexto — logo o defeito não bloqueia nenhuma jornada oficial. **Recomendação: manter como está (opção 4)** e, se houver autorização explícita, migrar a sincronização para as RPCs em **migration nova** (opção 3). **Nenhuma das 4 foi aplicada**; nenhum grant, policy, trigger ou migration foi alterado; a migration histórica `20261028200000_rework_orders.sql` permanece intacta.

**Correção documental sem apagar histórico:** `docs/HOMOLOGACAO-LOCAL.md` e `docs/INSTALL-LOCAL.md` afirmavam **459 migrations / 94-94 / 11-11**; hoje são **504 migrations** e **24 testes isolados**. O roteiro Windows original foi preservado e ganhou §0 com o estado atual. `E2E-SEGREDOS-E-ROTACAO.md` passou de 22 para 24 testes e aponta para o overlay no passo 1.

**Evidência de CI do QA-06 (07/11/2026):** HEAD `6ea7f55` → `CI` `42329315304` ✅ nos três jobs (typecheck/lint/unitários e guardas RLS, build, harness); `Playwright` `42329315260` com smoke público ✅, **`Ambiente E2E isolado (QA-01 a QA-05)` ✅** e autenticado ❌ no step 4. Log do job `128271929172`: 504 migrations + 3 seeds, **24 passed (9.9s)**, `skip=0`. Log do job autenticado `128272140678`: **exatamente 18** linhas `Missing required isolated E2E setting` e `exit code 2` — confirmação de que o gate segue intacto e de que o overlay **não** foi ligado ao CI. Localmente: 24 passed (10.5s), 36/36 unitários de `scripts/`, lint 0/0, SEC-02 **2.645 arquivos / 0 referências fixas**, YAML, `bash -n` e `diff --check` OK. Aplicação publicada segue HTTP 200, sem deploy adicional. **NO-GO mantido.**

**Pendências que não mudaram:** ambiente de homologação executado e validado, os 18 segredos via secret manager, rotação/revogação de ambos os PATs e da chave `anon`/JWT legada, decisão formal sobre o grant, fiscal/SEFAZ, PSP, restore, jornadas por cliques, smoke autenticado, aceite formal com commit/ambiente/data/responsável, SEC-01/OPS-01/EXT-01 e piloto. **CI verde não é evidência de aplicação utilizável.**

**QA-07 — auditoria anti-falso-verde do gate autenticado (09/11/2026):** antes de pedir os 18 segredos, verificou-se se o job `Jornadas autenticadas obrigatórias` rodaria testes de verdade **quando** eles existissem. Resposta: o gate está protegido contra `skip` (step 4, `E2E_REQUIRE_ALL='1'`, `FailOnSkippedReporter`, `forbidOnly`), mas **não** contra vacuidade nem contra perda de completude. `scripts/validate-e2e-no-skip.mjs` (**15 testes**) é puramente estático, deriva os **6 specs** de `testMatch`/`testIgnore` do próprio `playwright.config.ts` (sem duplicar a lista) e congela os invariantes: nenhum spec sem `expect()`, nenhum isolado vazado, reporter ligado ao anti-skip, 18 segredos no step 4, `E2E_REQUIRE_ALL` fora da lista **crua** do `for`, `e2e:critical` no workflow e piso `expected>=3` do smoke público.

**Achados (`docs/E2E-GATE-ANTI-SKIP.md`), NENHUM CORRIGIDO:** **G-01 (alta)** `tests/e2e/logistic-fiscal-correlation.spec.ts:45` usa `expect(correlationText).toContain('...')` — valida **reticências literais**, não o `correlation_id`; é um falso positivo embutido no único spec que promete rastreabilidade logístico-fiscal. **G-02 (alta)** `e2e/tests/navigation.test.ts:82-92` tem dois `if` aninhados sem `else`: se a URL contiver `login` ou o botão não estiver visível, o teste termina com **zero asserções** e o Playwright o reporta como **aprovado**. **G-03 (alta)** o `FailOnSkippedReporter` só garante `skipped===0` e `executed>0`; **não congela quantos/quais specs** foram coletados — remover um spec do `testMatch` manteria o job verde, enquanto o smoke público já exige `expected>=3`. Complementares: **G-04** `test.skip(!configured)` em 3 specs só é inofensivo por causa do `E2E_REQUIRE_ALL='1'`; **G-05** o spec fiscal não faz login, depende de massa e usa `waitForTimeout(2000)`; **G-06** esperas fixas de 700/600 ms; **G-07** o `if/return` de `navigation.test.ts:23` **não** é vacuamente verde (há asserção dentro e outra depois). `--strict` **falha de propósito** (`exit 2`) enquanto essa dívida existir: é o marcador honesto de que nada foi corrigido.

**Nenhum spec, `playwright.config.ts`, reporter, workflow, grant, migration ou segredo foi alterado.** Corrigir testes que **nunca rodaram** sem ambiente de homologação para validá-los produziria exatamente a falsa evidência que esta auditoria condena. Um job que passa com `toContain('...')` ou com zero asserções é **pior que um job vermelho**: parece evidência e não é. `.github/workflows/e2e.yml` permanece byte-a-byte intacto (`git diff` vazio).

**Incidente operacional (sem perda):** no início da rodada o sandbox perdeu `.git` e `.github/` (falha recorrente já registrada). Reconstrução por clone raso do remoto em `6ea7f55` + `reset --hard`; `node_modules` reinstalado com `bun install --frozen-lockfile` na raiz e em `tests/harness`. Sem esse reinstall, 2 testes de `test-rls-live.test.mjs` falham por `ERR_MODULE_NOT_FOUND` — artefato de ambiente, **não** regressão. O QA-06 já estava publicado.

**Evidência de CI do QA-07 (09/11/2026):** HEAD `c95e747` → `CI` `42608007378` ✅ nos três jobs (typecheck/lint/unitários e guardas RLS, build, harness); `Playwright` `42608007443` com smoke público ✅, **`Ambiente E2E isolado (QA-01 a QA-05)` ✅** e autenticado ❌ no step 4. Log do job `129128805128`: 504 migrations + 3 seeds, **24 passed (9.7s)**, `skip=0`. Log do autenticado `129129184341`: **18** linhas `##[error]Missing required isolated E2E setting` (mais 1 linha de eco do próprio script) e `exit code 2` — gate intacto, e o validador **não** foi ligado ao CI. Localmente: 24 passed (10.4s), **51/51** unitários de `scripts/`, `no-skip` OK com 7 avisos e `--strict` `exit 2`, lint 0/0, SEC-02 **2.648 arquivos / 0 referências fixas**, YAML e `diff --check` OK. Aplicação publicada segue HTTP 200, sem deploy adicional. **NO-GO mantido.**

**Ordem do que resta (inalterada):** corrigir G-01/G-02 com autorização e ambiente; executar a homologação com Docker; configurar os 18 segredos via secret manager; **rotacionar/revogar ambos os PATs e a chave `anon`/JWT legada**; decidir formalmente o grant de `production_rework_orders`; fiscal/SEFAZ, PSP, restore, smoke autenticado, jornadas por cliques e **aceite formal** com commit/ambiente/data/responsável. **CI verde não é evidência de aplicação utilizável.**

**Consolidação de evidência no GitHub (09/11/2026):** a pedido do responsável, toda a trilha de CI até aqui foi levada para o repositório em `docs/EVIDENCIA-CI-QA.md` — até então ela existia **apenas neste parecer**, que não é versionado. Os IDs de runs/jobs de **8 SHAs** (QA-02 a QA-07, mais `14e793c`) foram **reconsultados na API** e as contagens extraídas dos **logs**: `CI` ✅ nos 3 jobs em todos; `Playwright Tests` ❌ em todos; job isolado ✅ com `504 migrations + 3 seeds` e contagens 10 → 11 → 18 → 20 → 22 → 24 → 24 → 24, `skip=0`; job autenticado ❌ no step 4 com **exatamente 18** linhas de segredo ausente em **cada** SHA. QA-01 (`d7af1dfb`) ficou fora dos últimos 100 commits e está marcado no documento como **não revalidado**, com os IDs históricos do parecer. Nenhum número foi transcrito de memória. **Nenhum `Playwright Tests` inteiro ficou verde.**

**Publicação:** `ab2fe8e` (criação de `docs/EVIDENCIA-CI-QA.md` e 5 links) e `a4ba9f5` (correção do cabeçalho, que citava `c95e747` como "HEAD atual" quando o push documental já o havia superado). Ambos são **puramente documentais**: nenhum spec, config, reporter, workflow, grant, migration, segredo ou deploy foi alterado. `ab2fe8e` → `CI 42611245126` ✅ / `Playwright 42611245090` ❌ no mesmo step 4; `a4ba9f5` → `CI 42611634431` ✅ / `Playwright 42611634316` ❌ no mesmo step 4. HEAD final **`a4ba9f5` = `origin/main`**, worktree limpo, sem `credential.helper` nem helpers efêmeros, SEC-02 2.649 arquivos / 0 referências fixas. **NO-GO mantido.**

**QA-04 — isolamento multi-tenant e inventário de segredos (07/11/2026):** o boot do ambiente isolado passa a criar um **segundo tenant completo** (empresa com CNPJ fictício, filial, produto e admin próprio). `isolated-tenant-isolation.spec.ts` prova RLS entre empresas sem nenhum segredo: anti-vacuidade (cada tenant vê a própria massa), B não lê filiais/produtos/empresa de A e a recíproca, e B é barrado (`42501`) ao tentar operar uma filial de A enquanto opera normalmente na sua. A suíte isolada vai a **22 testes, `skip=0`**. Isso fecha a pendência de massa multi-tenant **sem remover** o spec legado e **sem afrouxar** nenhum gate.

**Correção factual:** o step `Validate isolated E2E configuration` valida **18 segredos**, não 19 — a 19ª chave do bloco `env:` é `E2E_REQUIRE_ALL='1'`, um literal. Todas as ocorrências desta avaliação foram corrigidas. O novo documento `docs/E2E-SEGREDOS-E-ROTACAO.md` mapeia cada um dos 18 ao spec que o consome, mostra onde já há cobertura equivalente no isolado e classifica os 6 specs restantes do job autenticado: **3 de API já cobertos** (tenant, jornada de lojas, PCP) e **3 irredutíveis** por exigirem navegador/frontend (`store-journey-ui`, `logistic-fiscal-correlation`, `navigation`). O gate **não foi removido, reduzido nem relaxado**: sem ambiente de homologação real, o job ❌ é o comportamento correto, não um defeito a silenciar.

**Rotação — depende de ação do responsável, não executável pelo assistente:** revogar **ambos os PATs** colados em texto ao longo da sessão; rotacionar a chave `anon`/JWT do projeto legado (valores públicos em `public/config.js`, única exceção nomeada do SEC-02, e histórico do Git não reescrito); confirmar que o `.env` local desrastreado não contém `service_role`/`DATABASE_URL`; adotar token de escopo mínimo com expiração curta via secret manager, nunca em texto no chat. **Urgência imediata.** Não há acesso ao painel GitHub nem ao Supabase nesta sessão.

**NO-GO mantido:** restam ambiente de homologação com frontend, os 18 segredos configurados de forma segura, integrações fiscais/PSP, restore cronometrado, smoke autenticado medido, SEC-01, OPS-01, EXT-01 e aceite formal com commit/ambiente/data/responsável.

**Evidência de CI do QA-03b (07/11/2026):** HEAD `1c9aa70` → `CI` `42326086986` ✅ nos três jobs (typecheck/lint/unitários e guardas, build, harness); `Playwright` `42326086927` com smoke público ✅, **`Ambiente E2E isolado (QA-01/QA-02/QA-03)` ✅** e autenticado ❌ no step 4 pelos 18 segredos. Log do job `128261588161`: 504 migrations + 3 seeds e **20 passed (9.1s)**, `skip=0`. Localmente: 20 passed (8.7s), 10/10 unitários, SEC-02 2.633 arquivos / 0 referências fixas, lint 0/0, YAML e `diff --check` OK. Aplicação publicada segue HTTP 200 e não foi alterada. **NO-GO mantido.**

**QA-03b — conclusão transacional fechada (07/11/2026):** `tests/e2e/isolated-production-completion.spec.ts` passa a exercitar `complete_production_order()` de ponta a ponta, eliminando a pendência registrada em QA-03. A massa vem do próprio replay: BOM do `technical_snapshot` congelado (urdume 0,115 e trama 0,100 por metro), 3 operações do roteiro concluídas por `record_production_step_progress()`, inspeção de qualidade aprovada e 2 lotes de entrada `available`/`approved`. Efeitos verificados: lote de saída (`PRODUCAO`, 10 m), `production_completion_requests` com custo unitário derivado dos insumos, **3 movimentos** no ledger (2 consumos + 1 entrada), `material_consumptions` com `consumed == expected`, `production_lot_genealogy` ligando entradas à saída, OP `completed` e **replay idempotente sem duplicação**. O segundo teste cobre 3 fail-closed (OP em `planned`, alocação incompleta e produção parcial) e prova que nenhuma tentativa inválida grava conclusão. Suíte isolada: **20 testes, `skip=0`**.

**QA-05 — diagnóstico causal do achado de RLS (07/11/2026):** `isolated-production-rls-finding.spec.ts` congela o comportamento como evidência reproduzível. Causa raiz: `sync_rework_order_status()` (migration `20261028200000_rework_orders.sql`) é trigger `AFTER UPDATE OF status` em `production_orders`, **SECURITY INVOKER**, e executa `UPDATE public.production_rework_orders` incondicionalmente; a mesma migration dá a `authenticated` **apenas `SELECT`** nessa tabela (`GRANT ALL` só para `service_role`). O PostgreSQL checa o privilégio antes de procurar linhas, portanto transições de status por usuário autenticado falham mesmo sem haver retrabalho. As RPCs oficiais são `SECURITY DEFINER` e funcionam.

Existem **duas barreiras**, com ordem relevante: o trigger `BEFORE` `tr_block_unverified_production_completion` (**intencional**) barra `completed` com a mensagem da transação oficial; para `in_progress`/`cancelled` o `BEFORE` deixa passar e o `AFTER` de retrabalho esbarra no grant ausente (**acidental**). O teste prova também que `UPDATE` de `notes` funciona e que `record_production_step_progress()` muda o status pela via oficial. **Conclusão: é defeito de permissão, não proteção de integridade.** Ainda assim **não foi corrigido**: conceder `UPDATE` ou tornar o trigger `SECURITY DEFINER` ampliaria a superfície de escrita e exigiria autorização explícita, migration própria e revalidação do harness. Alternativas registradas, nenhuma aplicada.

**Pré-voo de homologação (QA-05):** `scripts/validate-homologacao-env.mjs` extrai os **18** nomes do próprio `for name in ...` do workflow (sem duplicar a lista), reprova placeholders, PAT em texto e URL apontando para `useerp.lovable.app`, e **nunca imprime valores**. 5 testes unitários, `--list` para provisionar, `exit 2` em falha. É diagnóstico local do operador: não está no CI, não substitui a execução dos testes e **não altera o gate**. A suíte isolada chega a **24 testes, `skip=0`**.

NF-e/SEFAZ, PSP, baixa de estoque por venda, cotação com múltiplos fornecedores, check-in WMS, jornadas por cliques e massa multi-tenant seguem fora do isolado. **NO-GO mantido**; rotação de chaves/PAT, restore, smoke autenticado, Playwright autenticado (18 segredos), SEC-01, OPS-01, EXT-01 e aceite formal permanecem abertos.

**Evidência final do QA-02 (07/11/2026):** HEAD `14e793c` → `CI` `42319602554` ✅ nos três jobs (typecheck/lint/unitários e guardas, build, harness); `Playwright` `42319602538` com smoke público ✅, **`Ambiente E2E isolado (QA-01/QA-02)` ✅** e autenticado ❌ pelos 18 segredos ausentes. Log do job `128240668219`: replay de 504 migrations + 3 seeds e **11 passed (8.1s)**, `skip=0`. Localmente com `bun 1.4.2`: 11 passed (6.8–8.0s), 20/20 execuções do gate de transporte após a correção do flaky e 8/8 testes puros. Gate SEC-02: 2.630 arquivos / 0 referências fixas. Aplicação publicada segue HTTP 200 e não foi alterada por estes commits. **NO-GO mantido** — QA-03 (golden paths, PCP/fiscal, separação de papéis), rotação de chaves/PAT, restore, fiscal/PSP e aceite formal seguem abertos.

**Evidência de CI do QA-02 (07/11/2026):** `1eddaf7` → `CI` `42317975961` ✅ nos três jobs; `Playwright Tests` `42317976000` com smoke público ✅, **`Ambiente E2E isolado (QA-01/QA-02)` ✅** e autenticado ❌ pelos 18 segredos ausentes. Log do job `128235234666`: replay de **504 migrations + 3 seeds**, **10 passed (9.9s)**, `skip=0` validado pelo reporter anti-skip, com os três testes novos de QA-02 verdes — incluindo a primeira escrita de negócio (`create_supply_request`) e o fail-closed de quantidade inválida. Gate SEC-02: 2.629 arquivos / 0 referências fixas. **NO-GO mantido** (cadeia completa, golden paths e aceite formal ainda abertos).

**QA-02 — primeiro incremento (06/11/2026):** a suíte isolada passou de 7 para **10 testes** com `tests/e2e/isolated-store-journey.spec.ts`, sem nenhum segredo e sem rede externa. Os IDs de empresa/produto/filiais são descobertos no boot (`.env.e2e.generated`), não vêm de homologação. Novas evidências: massa dos seeds consultável sob RLS real; `create_supply_request` grava solicitação `PENDENTE`, relida por `GET` sob RLS e presente em `factory_inbox` — **primeira escrita de negócio no ambiente isolado**; `p_quantity: 0` falha fechado sem efeito colateral. `testMatch` e o nome do job foram atualizados; reporter anti-skip mantido. **Escopo honesto:** decisão do gestor, expedição, recebimento com divergência/saldo, jornadas PCP/fiscal e os 3 golden paths `test.fixme` **não** foram migrados neste incremento — exigem massa por papel e saldos por filial. DD-01/DD-02 seguem abertos. **NO-GO mantido.**

**Disponibilidade confirmada (06/11/2026):** depois de `12f5686`, o Lovable passou a servir `/config.js` com `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, mantendo `<script src="/config.js">` antes do módulo no `index.html` e o bundle `erp-core-BqoMmIh2.js`. Verificação externa: HTTP 200; a rota `/login` voltou a renderizar "Acessar Sistema / Email / Senha / Entrar" (durante o INC-04 o renderizador só obtinha o badge do Lovable). `CI` `42314065140` ✅ no HEAD `12f5686`; gate SEC-02 com 2.628 arquivos / 0 referências fixas. O responsável confirmou "tudo funcionando". **Disponibilidade, porém, não é aceite formal**: seguem pendentes rotação das chaves legadas e do PAT, smoke pós-publicação com login e leitura autenticada, registro de commit/ambiente/data/responsável, QA-02/03 (jornadas e golden paths), SEC-01, OPS-01, EXT-01 (fiscal/PSP), restore cronometrado e piloto. **NO-GO mantido para produção**, agora com o ambiente de demonstração operacional.

**Fechamento do INC-04 / mudança de aceite (06/11/2026):** a pedido expresso do responsável ("preciso que o sistema esteja ligado"), a religação foi feita por `public/config.js` — arquivo de runtime já carregado por `index.html` — definindo `window.__USE_ERP_CONFIG__` com `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, que `config.ts` prioriza. Não exige `VITE_*` no build, não altera o bundle MCP (`492bfb62`), funciona em qualquer domínio e preserva a sobrescrita da instalação local. O gate SEC-02 passou a varrer `public/` com **`public/config.js` como única exceção nomeada**, mantendo tolerância zero no restante (2.628 arquivos / 0 referências). **Isso revoga parcialmente o aceite "zero refs/JWT versionados" do SEC-02**, por decisão do responsável e para restabelecer disponibilidade; o risco (ref e chave pública em arquivo versionado e no JS servido) está registrado em `docs/ENVIRONMENT.md` §0.2 e em `AGENTS.md`. Rotacionar as chaves legadas e o PAT segue urgente; nenhum aceite formal, smoke pós-publicação, restore, fiscal/PSP ou piloto foi executado. **NO-GO mantido.**

**INC-04 — publicação indisponível após rebuild (06/11/2026):** o Lovable gerou `erp-core-BqoMmIh2.js` a partir de `653ad43`. O bundle servido não contém `HOSTED_KEY`, JWT, ref de projeto **nem** `import.meta.env.VITE_*`: `getSupabasePublishableKey()` devolve `""` e a guarda de `client.ts` lança, deixando a página sem aplicação montada (HTTP 200, tela de login ausente). Cadastrar as três variáveis no painel **não as injetou no `vite build`**. `CI` `42246740378` ✅ e deploy quebrado — confirmação empírica de que CI verde não prova aplicação utilizável, lacuna já apontada em INC-01. A religação depende de decisão do responsável sobre como o ambiente de build recebe as variáveis; nenhuma chave foi reintroduzida no repositório. **NO-GO mantido**, agora com indisponibilidade ativa.

**Fechamento do INC-03 no repositório (06/11/2026):** `653ad43` removeu `HOSTED_URL`/`HOSTED_KEY`/`isLovableHosted()` de `config.ts`, restaurou o manifest (`project-ref-unset`) e o bundle MCP gerado (`492bfb62`), e registrou a sequência em `docs/ENVIRONMENT.md`. `CI` `42246740378` ✅ nos três jobs (unitários e guardas, build, harness); `Playwright` `42246740205` com smoke público ✅, `isolated-e2e` ✅ e autenticado ❌ pelos 18 segredos. Gate SEC-02: 2.627 arquivos / 0 referências fixas. **Ressalva essencial:** a URL pública continuava servindo o bundle antigo `erp-core-Db26LUJn.js` (mesmo MD5), que contém o JWT `anon` em texto claro — **o repositório foi limpo, o deploy não**. O próximo build do Lovable a partir de `653ad43` exige as três variáveis no painel; sem elas `supabaseKey is required.` retorna. Rotação das chaves legadas e do PAT segue pendente e urgente. **NO-GO mantido** até aceite formal com commit, ambiente, data, responsável e smoke pós-publicação.

**Decisão do responsável (06/11/2026, após INC-03):** optou por **configurar as três variáveis `VITE_*` no painel do Lovable** antes de remover o fallback. Sequência acordada: (1) cadastrar e gerar novo build — `getSupabasePublishableKey()` prioriza `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` sobre `HOSTED_KEY`, portanto o app passa a usar o painel; (2) só então remover `HOSTED_URL`/`HOSTED_KEY`/`isLovableHosted()`, restaurar manifest e bundle MCP e republicar. **Não remover o fallback antes disso**: derrubaria a publicação em produção. Correção pendente até confirmação do responsável. **NO-GO mantido.**

**INC-03 — "funcionou" à custa de chave embutida (06/11/2026):** `https://useerp.lovable.app` responde HTTP 200 em `/` e `/login` e renderiza a tela de login (verificado pelo HTML e pelos 4 bundles JS servidos). O motivo **não** foi configurar variáveis no painel: o merge `d03f9f6`, do bot do Lovable, inseriu em `src/integrations/supabase/config.ts` as constantes `HOSTED_URL` (`https://<ref legado>.supabase.co`) e `HOSTED_KEY` (JWT `anon` em texto claro), além de `isLovableHosted()`, que devolve esses valores **somente** quando `location.hostname` termina em `.lovable.app` / `.lovableproject.com`. O bundle `erp-core-Db26LUJn.js` contém a chave embutida. Consequências: `CI` `42239516941` ❌ no step `Sem projeto, JWT ou token fixo no código (SEC-02)` com build/harness pulados; refs legados em `config.ts`, `.lovable/mcp/manifest.json` e no bundle MCP; **em qualquer outro domínio a chave fica vazia e `supabaseKey is required.` retorna**. `Playwright` `42239516873`: isolado ✅, smoke público ✅, autenticado ❌ (18 segredos). O histórico Git está **preservado** (merge de `a5bd59f` com `02351d27`), `.env` segue fora do índice e `AGENTS.md`/guarda do `client.ts` foram mantidos. É a terceira vez que o bot contorna o aceite de segurança para curar o sintoma. **Rotacionar as chaves do projeto legado e o PAT é urgente. NO-GO mantido**: CI vermelho, chave em código-fonte, solução válida para um único domínio e sem aceite formal.

**INC-02 — regressão de segurança introduzida pelo bot do Lovable (06/11/2026):** para "corrigir" o `supabaseKey is required.`, o merge `3e23d4f` ("Corrigiu env público e republicou") **reintroduziu `.env` no índice**, removeu sua linha do `.gitignore`, fixou o ref do projeto legado em `.lovable/mcp/manifest.json` e em `supabase/functions/mcp/index.ts` (editando manualmente o bundle gerado) e gravou em `AGENTS.md` a instrução de nunca ignorar o arquivo — risco de recorrência automática. O `CI` `42230942234` falhou no step `Sem projeto, JWT ou token fixo no código (SEC-02)`, com build e harness pulados. Corrigido por `a5bd59f`: `.env` removido do índice e preservado no disco, `.gitignore`/manifest/bundle restaurados, instrução de `AGENTS.md` substituída pela correta, sem reescrever histórico. `CI` `42231394590` ✅ nos três jobs; `Playwright` `42231394595` com smoke público ✅ e `isolated-e2e` ✅, autenticado ❌ pelos 18 segredos. **O app já publicado não é alterado por esse commit** (o JS servido já contém a chave), mas um novo publish sem as variáveis no painel traz o erro de volta. A "correção" do bot tratou o sintoma à custa do aceite de segurança; **rotacionar as chaves do projeto legado e o PAT tornou-se ainda mais urgente**. **NO-GO mantido.**

**INC-01 — falha de runtime na publicação Lovable (06/11/2026):** após o SEC-02 desrastrear `.env`, a publicação no Lovable abriu em tela branca com `Uncaught Error: supabaseKey is required.` no bundle `erp-core-*.js`. Causa: `VITE_SUPABASE_PUBLISHABLE_KEY` ausente no **build** → `getSupabasePublishableKey()` devolve `""` → `createClient` lança na importação do módulo, antes de renderizar. A correção é **operacional**: cadastrar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` no painel do Lovable e **gerar um novo build** (Vite embeda `VITE_*`); não se deve versionar `.env` novamente nem reutilizar a chave do projeto legado. O `CI` `42224059811` estava verde no momento da falha: o step `Build não altera fontes rastreadas` valida o diff das fontes geradas, **não executa o bundle com variáveis reais**. Fica registrada a lacuna de due diligence: **CI verde não é evidência de aplicação utilizável**; falta smoke de runtime pós-publicação com variáveis do ambiente e aceite formal. **NO-GO mantido.**

**Fechamento documental (06/11/2026):** `03133e0` registrou SEC-02/03, QA-01 e INC-01 na nova §6 do índice de planos e adicionou ao `docs/README.md` os links para `ENVIRONMENT.md` e `E2E-Lojas.md`, preservando integralmente as seções 1–5 e a baseline `8a5dbb35`. `CI` `42229782687` ✅ nos três jobs. O workflow `Playwright Tests` `42229782682` não foi visto concluído: `isolated-e2e` ✅, mas `Smoke público obrigatório` ficou preso no step `Install Playwright Chromium` (timeout de 30 min do job) — gargalo de infraestrutura do runner, sem relação com a mudança, que foi apenas de documentação. **NO-GO mantido.**

**Atualização de 06/11/2026:** o commit `4365895` levou essa evidência para os documentos versionados (`docs/E2E-Lojas.md` §0 e plano-mestre §7.1). No novo HEAD, `CI` `42224059811` ✅ nos três jobs e `Playwright Tests` `42224059661` com smoke público ✅, **`isolated-e2e` ✅** e autenticado ❌ pelos mesmos 18 segredos. Nenhuma mudança de código; **NO-GO mantido**.

**Correção de precisão:** DD-02 ("E2E autenticado nunca executado") fica **parcialmente superado**. Há sim um E2E autenticado executado, com login, RLS e RPC reais — mas ele valida o **contrato de infraestrutura**, não as jornadas de negócio. Continua verdadeiro que nenhuma jornada completa de loja, PCP, venda, compra ou fiscal foi executada por cliques ou por API com massa por papel.

**O que ainda bloqueia (inalterado):**

1. O job legado `authenticated` continua falhando em `Validate isolated E2E configuration` pelos mesmos 18 segredos; os 3 golden paths seguem `test.fixme`. Migrá-los para o ambiente isolado é QA-02/QA-03.
2. Nenhum navegador/Chromium foi executado nesta frente: os 7 testes são de API/contrato. Validação de telas, UX e dispositivo real segue pendente.
3. Nenhuma migration foi aplicada em banco real, nenhum dado de cliente foi usado, nenhuma chave foi rotacionada e não há aceite formal com ambiente, data e responsável.
4. O bootstrap do Postgres foi **deliberadamente duplicado** do `harness.mjs` para não alterar um gate que passa 249/249; extrair para módulo comum é dívida técnica registrada.
5. **Migração de escopo:** os 2 testes de `src/lib/testing/integration/workflow.test.ts` saíram da suíte unitária (441 → **439**) e passaram a rodar como 2 dos **7** testes isolados. Não houve perda de cobertura: saíram de um caminho que dependia de credencial local e entraram num banco real.

**Veredito:** **NO-GO mantido.** QA-01 elimina uma objeção concreta de infraestrutura e melhora a verificabilidade do repositório, mas não produz evidência de operação transacional, fiscal ou de continuidade. Para um comprador, o que mudou é que agora existe um ambiente onde as provas de QA-02/QA-03 *podem* ser produzidas — não que elas tenham sido produzidas.
