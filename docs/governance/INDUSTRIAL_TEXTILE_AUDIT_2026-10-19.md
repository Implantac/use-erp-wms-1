# Auditoria industrial têxtil — USE ERP-WMS (19/10/2026)

## Veredito

**O sistema ainda não atende integralmente aos requisitos da plataforma têxtil integrada da pluma à expedição.**

Há uma base relevante de cadastros, rotas, OPs, PCP/MRP, WMS, qualidade e RLS, mas a jornada industrial completa não está homologada. A transação de banco para concluir OP foi criada em migration posterior a esta auditoria e provou, em PostgreSQL isolado com esquema mockado, consumo por lote, operações, qualidade, genealogia, ledger e idempotência; contudo ela ainda não foi aplicada na stack local do usuário, não foi ligada à interface e não substitui o golden path. O MRP continua bruto e os testes ponta a ponta de produção permanecem em `test.fixme`. Portanto, operacionalmente, a conclusão de OP continua bloqueada/não homologada.

Este documento registra a auditoria antes das alterações deste lote. Não substitui testes em banco isolado, ensaio RLS A/B, piloto industrial ou homologação fiscal.

## Evidências inspecionadas

- Rotas e telas: `src/routes/ProductionRoutes.tsx`, `src/modules/production/*`, `src/hooks/production/*`.
- Motores e pré-validações: `src/lib/pcp/mrp.ts`, `src/modules/production/mrp/grossNeeds.ts`, `src/lib/textile/processModel.ts`, `src/lib/textile/lineage.ts`.
- Perfis industriais: `src/config/industrialProfile.ts` e `src/modules/admin/enterprise-config/EnterpriseConfig.tsx`.
- Banco: 451 migrations em `supabase/migrations` na data da auditoria original (453 após as migrations industriais), incluindo `production_orders`, `production_routes`, `production_route_steps`, `production_bom`, `product_technical_sheets`, `quality_inspections`, `stock_movements`, `stock_lots`, WMS e funções de estoque.
- Bloqueio de conclusão: `supabase/migrations/20261013210000_block_unverified_production_completion.sql`.
- Entrada automática de estoque ao concluir OP: `generate_stock_from_production` (migrations de 2026-04 e 2026-10). Como a conclusão está bloqueada, esse caminho não deve ser tratado como jornada homologada.
- Testes: `tests/e2e/production-golden-path.spec.ts` está em `test.fixme`; testes unitários industriais existentes foram executados neste lote.

## Matriz de rastreabilidade

| Requisito | Módulo atual | Arquivo/serviço | Tabela/função | Estado | Lacuna | Próxima alteração/homologação | Teste de aceite |
|---|---|---|---|---|---|---|---|
| Perfis A–D configuráveis | Configuração da empresa | `EnterpriseConfig.tsx`, `industrialProfile.ts` | `companies.settings.industrial` | Parcial | Perfil é planejamento/apresentação; não configura unidade, máquinas, calendários, inspeções obrigatórias nem autorização server-side por processo | Manter núcleo único; evoluir configuração por empresa/unidade somente com regras server-side | Salvar perfis A–D e confirmar que processos não habilitados não executam |
| Cadastro técnico industrial | Produtos, fichas, BOM, roteiros | `useTechnicalSheets`, `useProductionRoutes`, `OrderBomTab` | `products`, `product_technical_sheets`, `production_bom`, `production_routes` | Parcial | Ficha mistura materiais/etapas em JSON; BOM separado; não há modelo explícito e versionado de artigo têxtil, receita química e especificação de qualidade | Não criar cadastro paralelo; versionar/imutabilizar revisões usadas pela OP | Alterar ficha/roteiro após liberar OP e provar que a OP mantém a revisão original |
| Roteiros e OPs | Produção/PCP | `ProductionRoutesPage`, `ProductionOrders`, `useProductionOrders` | `production_routes`, `production_route_steps`, `production_orders`, `production_order_steps` | Parcial; conclusão bloqueada | OP não registra snapshot completo de BOM/roteiro/receita; conclusão é rejeitada pelo trigger de segurança | Implementar transação server-side de conclusão antes de reabilitar | OP com operação obrigatória pendente, qualidade bloqueada ou consumo inválido não conclui |
| PCP/MRP | PCP e MRP | `PCPPanel`, `MRPPage`, `grossNeeds.ts`, `mrp.ts` | `supply_stock`, `product_technical_sheets`, `production_orders` | Parcial | MRP usa saldo bruto; não considera reservas, bloqueios, lotes, entradas previstas, lead time, mínimo/múltiplo nem necessidade líquida por data | Evoluir cálculo a partir do ledger e reservas reais, sem dupla contagem | Necessidade líquida reconciliada com físico, reservado, bloqueado e ordens abertas |
| Capacidade finita | Programação/APS | `ProductionSchedule`, `APSPage`, `useProductionSchedule` | `production_schedule`, `production_capacity` | Parcial | Janela não reserva recurso; APS usa premissas simplificadas e capacidade manual | Neste lote: detectar conflitos temporais por recurso/centro registrado e impedir novo agendamento conflitante na interface; reserva real exige RPC/concorrência | Duas OPs no mesmo recurso e horário geram conflito; horários adjacentes não |
| Fiação | Pré-modelo têxtil | `processModel.ts`, `TextileProcessMap` | sem tabela têxtil integrada ao ledger | Não comprovado | Etapas são vocabulário/pré-validação; não há execução persistida por lote, mistura, título, rendimento e perdas | Executar sobre OP/roteiro/lotes existentes após transação industrial | Lote de pluma gera fio com genealogia, rendimento e perdas persistidos |
| Tecelagem | Pré-modelo + tabelas legadas | `processModel.ts`, dashboards têxteis | `textile_yarn_inventory`, `textile_weaving_orders` | Parcial/não integrado | Tabelas têxteis legadas não estão integradas ao fluxo principal de OP/estoque/qualidade | Não duplicar; integrar ou aposentar com migração planejada | OP de tecelagem registra tear, urdume/trama, metros, paradas e defeitos |
| Tinturaria | Pré-modelo | `processModel.ts` | sem partida/banho/receita persistidos | Não comprovado | Não há receita versionada, banho, parâmetros, laboratório de cor ou ΔE executáveis | Modelar como operação/receita/qualidade do núcleo, sem dosagens universais | Partida com receita aprovada, insumos por lote, parâmetros e liberação de cor |
| Acabamento | Pré-modelo/qualidade | `processModel.ts`, `QualityControl` | `quality_inspections` | Parcial | Não há parâmetros de acabamento, largura/gramatura/encolhimento nem liberação formal de lote | Reutilizar operações e inspeções com especificações por artigo | Lote bloqueado não segue; liberado registra medições e responsável |
| Rastreabilidade | Logs de produção + pré-validação | `ProductionTraceability`, `lineage.ts` | `production_logs`, `stock_lots`, `stock_movements` | Parcial | Tela é linha do tempo de logs e declara não ser genealogia; grafo de linhagem é em memória | Persistir arestas pai→filho vinculadas ao ledger existente | Consultar ancestrais/descendentes e saldo atual de um lote expedido |
| Qualidade/laboratório | Controle de qualidade | `QualityControl`, `useQualityInspections` | `quality_inspections`, `production_quality_checks` | Parcial | Há duas superfícies de qualidade; não há plano/critério, CIELAB/ΔE, NC formal ou liberação de lote | Neste lote: corrigir escopo por empresa, vínculo de etapa e unidade da OP; homologar decisão formal depois | Lote reprovado/bloqueado não é consumido/expedido sem transição autorizada |
| Estoque/WMS/compras/expedição | WMS/estoque | hooks WMS, RPCs de estoque | `stock_movements`, `stock_balances`, `stock_lots`, picking/shipment | Não comprovado ponta a ponta | Há RPCs e guardas, mas golden paths estão pendentes; movimentação de insumos pela UI está bloqueada até RPC homologada | Provar jornada no ledger existente, sem ledger paralelo | Receber→reservar→consumir→produzir→separar→expedir com saldos reconciliados |
| Custos industriais | Custos de produção/produto | `ProductCosts`, `useProductionCosts` | `production_costs`, `product_costs` | Parcial | Não há prova de custo por lote/etapa, rateios documentados ou prevenção de dupla contagem entre etapas | Documentar fórmulas e origem antes de automatizar | Custo da OP reconcilia materiais, tempos, perdas e terceirização |
| Dashboards | Industrial/BI/OEE/têxteis | `IndustrialDashboard`, `BIIndustrial`, `OEEDashboard` | OPs, inspeções, `oee_metrics` | Parcial; falha grave no Industrial | `IndustrialDashboard` tinha OEE, OPs, qualidade, paradas e cargas fixas no código | Neste lote: substituir por OPs/inspeções reais, fórmula documentada e “Sem dados suficientes” | Com banco vazio, nenhum KPI inventado; com OPs, drill-down confere |
| Máquinas/IoT | Máquinas/OEE | `useProductionMachines`, `useOEEMetrics` | `production_machines`, `oee_metrics` | Não comprovado | Não há prova de ingestão real, qualidade/atualidade, duplicidade ou fonte indisponível | Não gerar telemetria sintética como real; integração exige contrato de ingestão | Evento duplicado/fora de ordem não duplica leitura; fonte caída é sinalizada |
| Segurança/multiempresa | Auth/RLS/permissões | hooks por tenant, migrations RLS | policies e RPCs | Parcial/não comprovado | Há migrations e filtros no cliente, mas falta ensaio A/B executado em banco representativo | Executar runner A/B e testes negativos por tabela/RPC | Usuário da empresa B não lê nem altera OP/lote/qualidade da empresa A |
| Testes industriais | Unitários + E2E | `src/lib/pcp`, `src/lib/textile`, `tests/e2e` | fixtures/Playwright | Insuficiente | Golden path de produção é `test.fixme`; unitários não provam persistência | Criar jornada persistida em ambiente isolado | 15 passos da jornada industrial e cenários de falha/concorrência aprovados |

## Lote executado após esta auditoria

1. Dashboard industrial sem números fixos: OPs abertas/atrasadas, avanço médio e qualidade calculados de registros carregados da empresa ativa.
2. Qualidade: consulta escopada por empresa, remoção de junção inválida com `production_steps`, nome da etapa resolvido no cliente e unidade real da OP em vez de “peças” fixo.
3. Capacidade: detector puro de conflitos de programação por recurso/centro, com testes; a tela passa a registrar centro/recurso e bloqueia novo agendamento conflitante na interface. Isso não substitui reserva transacional no banco.
4. Documentação operacional: `docs/INDUSTRIAL_TEXTILE_GUIDE.md` descreve perfis, fórmulas, limites e a jornada de homologação exigida.

## Lote seguinte executado — conclusão transacional de OP (backend)

Arquivo: `supabase/migrations/20261019100000_production_completion_transaction.sql`.

O que foi criado:

1. `production_completion_requests`: uma conclusão por OP e chave de idempotência única por empresa.
2. `production_lot_genealogy`: arestas persistidas lote de entrada → lote de saída, com OP, conclusão, quantidades, unidades e referência da ficha quando as unidades diferem. A `output_quantity` é a quantidade total do lote de saída e não deve ser somada por aresta.
3. Colunas aditivas em `material_consumptions` (`lot_id`, `completion_id`, `stock_movement_id`) para ligar o consumo ao lote, à conclusão e ao movimento do ledger.
4. RPC `complete_production_order(...)`, `SECURITY DEFINER`, que na mesma transação:
   - exige usuário autenticado da mesma empresa, permissão `production.orders/write` ou papel admin/manager e compatibilidade de filial;
   - trava a OP e os lotes de entrada;
   - exige roteiro vinculado, todas as operações concluídas sem pendência e com quantidade suficiente;
   - exige inspeção registrada, quantidade aprovada suficiente, rejeição declarada compatível e nenhum status bloqueado/rejeitado/quarentena;
   - exige BOM e alocação > 0 para todos os componentes;
   - exige lote do componente/empresa, status `available`, qualidade liberada (`approved`/`released` ou equivalentes), saldo restante do lote e saldo disponível (`quantity - reserved_qty`) no ledger;
   - consome os lotes, cria o lote de saída, grava consumo, genealogia e movimentos `production_consumption`/`production` em `stock_movements` e conclui a OP.
5. O trigger de bloqueio foi mantido: escrita direta para `completed` continua rejeitada; a transição só passa quando a solicitação criada pela RPC existe para a mesma OP/empresa na transação.
6. `apply_lot_movement()` passou a ignorar movimentos com `source='production_completion'`, porque a RPC atualiza o lote explicitamente e o trigger legado não pode debitar uma segunda vez se a flag `usar_lote` estiver ativa.

Validação executada em PostgreSQL 18.4 embarcado e isolado, com esquema mínimo/mockado e triggers simulando o saldo pelo ledger e o gerador legado de estoque:

- sucesso: OP de 10 kg, consumo real de 25 kg contra esperado de 22 kg (ficha 2 kg/unidade + 10% de perda para 10 unidades processadas), saída aprovada de 9 kg e rejeição de 1 kg;
- saldos conferidos: lote de entrada 100 → 75 kg, saldo de entrada 100 → 75 kg, saldo de saída 9 kg, 2 movimentos da RPC, 0 movimentos do gerador legado, 1 consumo e 1 aresta de genealogia;
- replay com a mesma chave: retornou `idempotent_replay=true` sem novos movimentos;
- conclusão direta por `UPDATE`: bloqueada;
- lote em quarentena: bloqueado;
- saldo disponível insuficiente: bloqueado;
- operação pendente: bloqueada;
- usuário de outra empresa: bloqueado;
- duas chamadas concorrentes para a mesma OP: uma conclusão persistida e apenas dois movimentos (saída de insumo + entrada de produto).

Limites que permanecem: a migration não foi aplicada à stack Docker do usuário nem ao Supabase representativo completo; a interface ainda não chama a RPC; não há apontamento parcial, reserva de materiais por OP, snapshot imutável de BOM/roteiro/receita, plano de inspeção/liberação formal de lote, custos completos ou genealogia ligada à expedição. Por isso este lote é **backend parcial**, não homologação da jornada.

## Resultado da validação deste lote

- Testes industriais direcionados: **35 testes aprovados** nos arquivos de perfil industrial, MRP bruto, transições de OP, processo têxtil, genealogia em memória, dashboard industrial e conflitos de capacidade.
- Typecheck: **aprovado** (`bun run typecheck`).
- ESLint direcionado dos arquivos alterados: **aprovado** com `--max-warnings=0`.
- Suíte completa: **247/248 testes aprovados**. A única falha é pré-existente e externa ao lote: `src/lib/testing/integration/workflow.test.ts` tenta consultar a tabela remota `idempotency_keys` e expira em 5 s.
- Build de produção: **não concluído neste sandbox**. O Vite permaneceu na etapa de transformação por mais de 20 minutos e o processo foi encerrado para não consumir o ambiente; nenhum erro de código foi emitido. Isso não é evidência de build aprovado.
- Banco/E2E: **não executado**. Não houve banco Supabase isolado representativo neste lote; portanto nenhuma migration nova foi criada e nenhuma prontidão de produção é declarada.

## Critérios de aceite — situação

| Critério | Situação |
|---|---|
| 1. Quatro perfis sem duplicar módulos | Parcial |
| 2. Rotas configuráveis e executáveis | Parcial; execução completa não homologada |
| 3. OPs com efeitos reais em materiais, apontamentos, qualidade e estoque | Não atende; conclusão bloqueada por segurança |
| 4. Rastreabilidade origem/destino | Não atende de forma persistida |
| 5. PCP com materiais e capacidade | Parcial |
| 6. Fiação, tecelagem, tinturaria e acabamento especializados | Parcial/não comprovado |
| 7. Indicadores reais e documentados | Parcial; dashboard industrial corrigido neste lote |
| 8. Testes executáveis dos processos críticos | Não atende; golden path pendente |
| 9. Isolamento e permissões validados | Não comprovado em banco |
| 10. Migrations compatíveis | Não declarado sem execução em banco representativo |
| 11. Build/typecheck/testes relevantes | Ver relatório de execução do lote |
| 12. Funcionalidades não homologadas bloqueadas | Atende como postura de segurança |
| 13. Documentação correspondente | Parcial; este documento e gates existentes |

## Atualização pós-implementação — PCP de tecelagem (19/10/2026)

Esta seção registra o que foi implementado depois da auditoria original, sem reescrever o diagnóstico histórico acima.

### Migration e contrato de banco

Arquivo: `supabase/migrations/20261019110000_textile_weaving_pcp_execution.sql` (sobre `20261019100000`).

- Snapshot técnico congelado na OP (`technical_snapshot`, hash e data), numeração por empresa e etapas geradas do roteiro na criação (`create_textile_production_order`, idempotente).
- Reservas dedicadas de produção por OP/componente/lote (`production_material_reservations`) integradas a `stock_balances.reserved_qty`; `stock_reservations` não foi reutilizada porque exige FK para pedido de venda.
- Programação finita por recurso/máquina/centro com lock transacional e rejeição de sobreposição (`schedule_production_order`, `cancel_production_schedule`).
- Apontamento sequencial de etapas (`record_production_step_progress`) com metas derivadas da saída boa anterior e bloqueio de conclusão com pendência.
- Perfil e eventos de tecelagem (`weaving_order_profiles`, `weaving_production_events`) sem parâmetros presumidos.
- Decisão formal de qualidade (`decide_production_quality_inspection`) e conclusão (`complete_production_order`) consumindo primeiro as reservas da própria OP, com genealogia e replay sem duplicação.
- Compra MRP em rascunho idempotente (`generate_mrp_purchase_order` + `mrp_purchase_requests`).

### Interface ligada ao contrato

- OPs: criação de OP de tecelagem, detalhe com aba **Execução PCP** (reservas, etapas, qualidade, conclusão, genealogia), tabela com “Concluir na execução” via `onView`.
- Central PCP de Tecelagem (`/vertical/weaving`), Dashboard Têxtil (`/vertical/textile`), MRP líquido com snapshot da OP, programação com recurso/máquina, terminal sincronizado à RPC de etapas, fila sem avanço direto de OP, Kanban sem conclusão por arrastar, consumo de materiais somente leitura e qualidade com decisão formal.
- Dashboards sem métricas fabricadas: sem fonte comparável, exibem pendência/“Sem dados suficientes”.

### Evidências executadas

- `node /tmp/pgtest/run-weaving-test.mjs`: **WEAVING PCP TRANSACTION SUITE: PASS** — OP/snapshot/replay, reserva de 22 kg, lote em quarentena rejeitado, capacidade sem dupla alocação, etapas sequenciais, qualidade formal, conclusão com reserva consumida e genealogia, compra MRP idempotente, tenant cruzado rejeitado e concorrência com exatamente 1 sucesso/1 conflito.
- `node --test scripts/test-*.mjs` (exceto RLS live): **78/78 PASS**.
- Vitest completo: **251/252 PASS**; única falha conhecida e externa em `src/lib/testing/integration/workflow.test.ts` (consulta `idempotency_keys` remoto, timeout de 5 s).
- ESLint direcionado com `no-undef` nos arquivos alterados e `git diff --check`: **PASS**. O `typecheck` de raiz é fraco (referencia projetos sem compilá-los); por isso foi criado `typecheck:weaving` (`tsconfig.weaving-check.json`), que compila os arquivos do PCP de tecelagem e a spec E2E: **PASS**. O esbuild resolveu o grafo completo a partir de `src/main.tsx` sem import local ausente.
- `tests/e2e/textile-weaving-pcp.spec.ts`: descoberto pelo Playwright e **ignorado explicitamente sem credenciais/fixture** (`1 skipped`). Isso não é homologação de interface.
- Seed BIL em PostgreSQL embarcado: **PASS em duas execuções idempotentes**, com perfil `weaving_dyeing`, ramos tecelagem/tinturaria e módulos de produção liberados.
- Servidor Vite de desenvolvimento sobe e transforma os módulos da Central de Tecelagem. Build de produção neste sandbox: a tentativa com heap padrão do Node morreu por OOM (~1 GB) e a com heap ampliado não concluiu em tempo útil; o `Dockerfile.local` passou a pedir heap de até 4 GB e a doc local recomenda 6 GB de RAM no Docker Desktop. **Build completo não é declarado aprovado.**
- Instalação local: Compose validado estaticamente (11 serviços), variáveis sem default são só os segredos gerados pelo instalador, e as RPCs do PCP têxtil entraram na lista de grants de `docker/local/scripts/99-local-final.sql`.

### Limites que permanecem

- Migrations não aplicadas à stack Docker do usuário; `src/integrations/supabase/types.ts` não regenerado.
- Jornada completa na UI não homologada em banco representativo; fiação, tinturaria e acabamento especializados, custos por lote/OP, CIELAB/ΔE, planos de inspeção e genealogia ligada à expedição seguem parciais/não comprovados.
- O veredito integral permanece: **não atende integralmente aos 13 critérios de aceite**. O gate de tecelagem está comprovado em harness isolado e por contratos; a homologação local é o próximo passo.

## Rodada gerente de produção — programação e acompanhamento (2026-10-19)

Revisão ponta a ponta do fluxo do gerente de produção: programar OPs (capacidade finita), acompanhar execução por etapas, fila, Kanban, terminal do operador, detalhe da OP e painéis.

### Correções aplicadas nesta rodada
1. `useProductionSteps.generateStepsForOrder`: gera etapas só para OP sem etapas (contagem prévia por empresa) e retorno booleano — impede acompanhamento duplicado.
2. `ProductionSteps`: o diálogo de geração só fecha em sucesso; OPs em waiting_material/finishing/quality_check/outsourced continuam visíveis no acompanhamento (antes a OP sumia ao entrar em finishing, justamente na conclusão).
3. `ProductionSchedule`: OP com janela encerrada/cancelada volta a lista de programáveis; só janela scheduled/in_progress bloqueia reprogramação.
4. `ProductionQueue` inclui finishing/quality_check com ação Executar/concluir; `OperatorTerminal` enxerga OP pausada/aguardando material para retomada.

### Evidências executadas nesta rodada
- Postgres embarcado (harness permanente `scripts/live-manager-journey.mjs`): baseline + patches + 453/453 migrations + 99-local-final — REPLAY: PASS.
- Jornada SQL do gerente: **18/18 PASS** — programar, replay idempotente sem duplicar janela, conflito de máquina rejeitado, janela adjacente aceita, 2ª janela ativa rejeitada, cancelar e reprogramar, tenant cruzado rejeitado, etapa fora de sequência bloqueada, OP planejada→em produção, parcial 40/100, excesso de meta rejeitado, conclusão de Urdimento (98+2), última etapa→finishing, apontamento tardio rejeitado, painel de não-finais enxerga OPs.
- Frontend: typecheck `typecheck:weaving` PASS; Vitest 251/252 (única falha pré-existente: timeout remoto de `idempotency_keys`); contratos Node 79/79.
- Build de produção Vite continua **não aprovado neste sandbox** (OOM/sessão); na máquina do usuário usar o `Dockerfile.local` (heap 4 GB, Docker Desktop com 6 GB).

### Veredito da rodada
Programação finita e acompanhamento da produção **funcionam e estão comprovados** em banco real embarcado e em testes de frontend. Homologação na stack Docker do usuário continua pendente (aplicar migrations, regenerar tipos, E2E com fixture `E2E_WEAVING_*`).

## Rodada gerente de produção 2 — da programação à conclusão (2026-10-19)

A jornada SQL do gerente foi estendida até a conclusão da OP (harness permanente `scripts/live-manager-journey.mjs`). O replay completo expôs **quatro defeitos reais de banco** que quebravam o uso diário e foram corrigidos com migrations incrementais (total: 457 migrations):

| Migration | Defeito (evidência) | Correção |
|---|---|---|
| `20261019120000_products_item_kind_default_fix.sql` | `products.item_kind` DEFAULT legado `'resale'` viola o CHECK PT-BR — qualquer INSERT sem item_kind falhava (23514) | `SET DEFAULT 'revenda'` |
| `20261019130000_stock_balances_replica_identity_fix.sql` | `stock_balances` publicada no Realtime + `available_qty` GENERATED + REPLICA IDENTITY FULL → **todo UPDATE de saldo falhava** ("Replica identity must not contain unpublished generated columns"), bloqueando reserva/consumo/conclusão no PG15 local | `REPLICA IDENTITY DEFAULT` (PK) |
| `20261019140000_production_delay_alert_entity_id_fix.sql` | Trigger `check_production_delay_alert` compara `entity_id` (uuid) com `NEW.id::text` — **toda conclusão de OP e todo UPDATE de OP atrasada falhavam** (uuid = text) | Função recriada com `NEW.id` (uuid); comportamento preservado |
| `20261019150000_remove_legacy_stock_from_production_trigger.sql` | Trigger legado `generate_stock_from_production` exigia branch_id na conclusão e podia lançar consumo pela BOM atual ignorando lote/qualidade/genealogia | `DROP TRIGGER` (função preservada p/ reversão) |

### Evidências executadas nesta rodada
- Postgres embarcado: replay baseline + patches + **457/457 migrations** + 99-local-final — PASS.
- Jornada SQL do gerente: **41/41 PASS** — inclui OP têxtil completa: criar (snapshot/roteiro/etapas) → replay de criação → reservar 23 kg (saldo 100 físico/23 reservado, replay sem duplicar) → programar na Tear 01 → executar Urdimento (98+2) e Tecelagem (95+3, meta encadeada 98) → concluir sem qualidade **bloqueado** → aprovar inspeção → concluir consumindo a própria reserva (lote fio 100→77 kg, reserva consumida, lote de saída 95 m liberado, genealogia fio→tecido, exatamente 1 movimento de entrada) → replay de conclusão sem duplicar movimentos → 2ª conclusão retorna replay idempotente por OP → OP atrasada gera alerta de atraso sem erro de tipo.
- Frontend: contratos Node **80/80**; Vitest PCP **28/28**; typecheck `typecheck:weaving` PASS; ESLint dos scripts limpo; `git diff --check` limpo.
- Build Vite: transformou 4.920 módulos, mas o processo foi morto (exit 137 = OOM do sandbox com ~2 GB RAM) em "rendering chunks". **Build continua não aprovado neste sandbox**; na máquina do usuário o `Dockerfile.local` (heap 4 GB + Docker Desktop com 6 GB) é o caminho.

### Veredito da rodada
Programação finita, execução por etapas, qualidade e conclusão transacional **funcionam de ponta a ponta em banco real** (embarcado). Sem as 4 correções acima, reserva, acompanhamento de OP atrasada e conclusão estariam quebrados na instalação local. Homologação na stack Docker do usuário segue pendente (aplicar as 457 migrations, regenerar tipos, E2E com fixture `E2E_WEAVING_*`).

## Rodada gerente de produção 3 — pluma → fio 30 cardado → malha (2026-10-19)

Jornada completa de chão de fábrica no Postgres embarcado (Parte 3 de `scripts/live-manager-journey.mjs`), com estruturas configuradas pela empresa (rendimentos 1,18 kg de pluma/kg de fio e 1,03 kg de fio/kg de malha definidos na BOM do cenário — não são constantes do sistema):

1. **Fiação cardada** — OP de 100 kg de fio 30/1: roteiro Abertura e Limpeza → Cardagem → Passador → Maçaroqueira → Filatório de Anel (5 etapas geradas), reserva de 118 kg de pluma, programação no Filatório 01, execução com metas encadeadas (100→97→96→95→94→93 kg), aprovação do laboratório e conclusão consumindo a reserva: lote de pluma 500→382 kg e lote **FIO30-LOTE-001 com 93 kg**.
2. **Malharia circular** — OP de 90 kg de malha fio 30: reserva de fio acima do produzido (95 > 93 kg) **rejeitada**, reserva correta de 92,7 kg, programação no Tear Circular 01, Malharia Circular → Revisão de Malha (90→88→87 kg), conclusão sem qualidade **bloqueada**, aprovação e conclusão: lote **MALHA-LOTE-001 com 87 kg liberado (produto final)**, lote de fio 93→0,3 kg.
3. **Rastreabilidade ponta a ponta**: genealogia pluma→fio e fio→malha persistida (2 elos), nenhuma reserva pendurada ao fim da cadeia, as duas OPs `completed`.

### Correção aplicada nesta rodada
- `20261019160000_textile_order_sector_from_route.sql`: OPs de fiação/malharia nasciam com `sector='Tecelagem'` fixo na RPC de criação. O setor agora vem do cadastro da primeira operação do roteiro (`production_steps.sector` da empresa), com fallback 'Tecelagem'. Provado: OP de fiação classificada 'Fiação' e OP de malharia 'Malharia'; OP de tecelagem inalterada.

### Evidências executadas nesta rodada
- Replay embarcado: **458/458 migrations** + jornada do gerente **66/66 PASS** (18 programação/acompanhamento + 23 conclusão/estoque + 25 pluma→malha).
- Frontend: contratos Node **80/80**; typecheck `typecheck:weaving` PASS.

### Veredito da rodada
O fluxo **da pluma ao produto final funciona** para malha de fio 30 cardado usando o mesmo motor (OP com snapshot, reserva por lote, capacidade finita, etapas sequenciais, qualidade formal, conclusão transacional com genealogia). Homologação na stack Docker do usuário segue pendente (aplicar as 458 migrations, regenerar tipos, E2E com fixture e build local com 6 GB de RAM).

## Rodada gerente de produção 4 — malha crua → tinturaria → acabamento (2026-10-19)

Parte 4 de `scripts/live-manager-journey.mjs`, continuando do lote MALHA-LOTE-001 (87 kg) da rodada anterior:

1. **OP de beneficiamento** de 80 kg de malha tingida e acabada, classificada automaticamente no setor **Tinturaria** (primeira operação do roteiro). Roteiro: Preparação e Purga → Tingimento → Centrifugação → Secagem e Estabilização → Revisão e Rolagem (5 etapas geradas).
2. **Receita executada como estrutura**: 1,04 kg de malha crua + 0,025 kg de corante reativo por kg acabado (configuração da empresa). Reserva de corante em **quarentena rejeitada**; reserva correta de 83,2 kg de malha + 2 kg de corante; programação no Jet 01.
3. **Execução e qualidade**: metas encadeadas 80→79→78→77→76→75 kg; conclusão sem aprovação **bloqueada**; laboratório aprova cor/acabamento (75 kg); conclusão consome os dois insumos — malha crua 87→3,8 kg, corante 10→8 kg — e gera **MALHA-TING-LOTE-001 com 75 kg liberados**, custo unitário calculado dos insumos reais.
4. **Rastreabilidade total da cadeia**: genealogia pluma→fio→malha crua→malha tingida com 4 elos persistidos; o lote tingido liga 2 insumos (malha + corante); 4 OPs da cadeia concluídas.

### Evidências executadas nesta rodada
- Replay embarcado: **458/458 migrations** + jornada do gerente **84/84 PASS** (programação/acompanhamento + conclusão/estoque + pluma→malha + tingimento/acabamento).
- Contratos Node e typecheck do fluxo revalidados sem regressão.

### Veredito da rodada
A cadeia **da pluma ao produto tingido e acabado funciona** no mesmo motor transacional, com receita química consumida por lote, bloqueio de insumo em quarentena, qualidade formal antes da conclusão e custo por lote a partir dos insumos reais. Homologação na stack Docker do usuário segue pendente.

## Rodada gerente de produção 5 — venda e expedição da malha tingida (2026-10-19)

Parte 5 de `scripts/live-manager-journey.mjs`, fechando o ciclo comercial sobre o lote MALHA-TING-LOTE-001 (75 kg):

1. **Venda e reserva**: pedido PV-2026-0001 de 50 kg para cliente cadastrado; `wms_reserve_order_stock` reservou 50 kg (saldo 75 físicos/50 reservados). Pedido PV-2026-0002 de 40 kg com apenas 25 kg livres: reserva **parcial** (25 reservados + 15 pendentes), sem vender o que não existe.
2. **Separação e expedição**: `wms_pick_order_stock` separou a linha e baixou o saldo por produto (75→25 kg); `wms_ship_order` marcou a reserva como `shipped`. Usuário de outra empresa tentando reservar o pedido: **cross_tenant_forbidden**.

### Lacuna evidenciada (bloqueante p/ rastreabilidade até o cliente)
A expedição WMS atual **não é por lote**: após expedir 50 kg, `stock_lots.remaining_qty` do lote tingido continua 75 kg e o movimento de picking (`source='wms_pick'`, `direction='transfer'`) não carrega `lot_id` (evidência: `movimentos_saida=1 com_lote=0`). Consequências: (a) não é possível afirmar qual lote foi para qual cliente pela expedição; (b) saldo por lote e saldo por produto dessincronizam após a primeira venda. Correção recomendada (fora desta rodada, por tocar o WMS comercial): preencher `stock_reservations.lot_id` no FIFO por lote em `wms_reserve_order_stock`, gravar `lot_id` no movimento de picking e baixar `stock_lots.remaining_qty` na expedição — mantendo um único ledger (`stock_movements`).

### Evidências executadas nesta rodada
- Replay embarcado: **458/458 migrations** + jornada do gerente **92/92 PASS** (inclui a evidência numerada da lacuna de lote na expedição).
- Contratos Node revalidados sem regressão.

### Veredito acumulado das rodadas de gerente
Da pluma ao produto tingido, **produzir, reservar, programar, executar, aprovar e concluir funciona** com evidência em banco real; vender, separar e expedir funciona por produto. O elo fraco comprovado é a **rastreabilidade lote→cliente na expedição WMS**, registrado acima com correção desenhada. Homologação na stack Docker do usuário segue pendente.

## Rodada 6 — expedição por lote implementada (2026-10-19)

A lacuna evidenciada na rodada 5 foi corrigida com a migration `20261019170000_wms_lot_based_expedition.sql` (total: 459 migrations), mantendo as assinaturas/retornos das RPCs WMS e um único ledger (`stock_movements`):

1. `wms_reserve_order_stock`: o FIFO por saldo agora **pula lote com qualidade bloqueada/quarentena/rejeitada** e grava `stock_reservations.lot_id` (saldos legados sem lote seguem com NULL — compatível).
2. `wms_pick_order_stock`: com lote amarrado, baixa **somente o saldo daquele lote**, debita `stock_lots.remaining_qty` na separação (esgotou → `consumed`, mesma semântica da conclusão de OP) e grava o movimento com `lot_id` e `batch` = número do lote. `direction='transfer'` preservado para o ledger não recontabilizar (o trigger `apply_lot_movement` é opt-in e ignora transfer). `wms_ship_order` inalterado: expedir é documental; a saída física é a separação.

### Evidências executadas nesta rodada (Parte 5 atualizada da jornada)
- Reserva do pedido PV-2026-0001 nasce com `lot_id` do lote tingido; após picking/expedição o lote baixa **75 → 25 kg** e o movimento de separação identifica o lote (`batch=MALHA-TING-LOTE-001`).
- Venda com único lote em quarentena: **nada é reservado** (0 reservado, item parcial/pendente).
- Todo o restante intacto: **459/459 migrations** no replay e jornada do gerente **94/94 PASS**; contratos Node 80/80; ESLint do harness limpo.

### Veredito acumulado
A rastreabilidade agora é completa e persistida: **pluma → fio → malha crua → malha tingida → pedido/cliente**, com lote identificado em cada movimento (produção e expedição) e saldos por produto e por lote sincronizados. Homologação na stack Docker do usuário segue pendente (aplicar as 459 migrations, regenerar tipos, build local com 6 GB de RAM e E2E com fixture `E2E_WEAVING_*`).

## Rodada 7 — fixture E2E destravada + roteiro de homologação (2026-10-19)

- Criada `tests/e2e/fixtures/weaving-fixture.sql` (molde do seed-bil, idempotente): empresa isolada "E2E Homologação Têxtil", usuário de teste com profile/papel de gerente, artigo `E2E-TECIDO`, componente `E2E-FIO-30` (BOM 0,22 kg/m + 5%), roteiro Urdimento→Tecelagem e lote liberado de 5.000 kg com saldo.
- Ajustes que a validação impôs à fixture: (a) tempo total do roteiro de 50 min — a spec agenda janela de 60 min e a programação rejeita janela menor que o estimado da OP; (b) sem DELETE/UPDATE em `stock_balances` (imutável por trigger) — saldo inserido uma única vez; (c) reexecução não edita rota/etapas já vinculadas a OP (governança de roteiro congelado).
- Prova executada: fixture aplicada 2× e a jornada da spec simulada como o usuário fixture em Postgres embarcado — **11/11 PASS** (criar OP, reservar 2,31 kg, programar, sobreposição rejeitada, etapas, qualidade, conclusão, replay sem duplicar genealogia).
- Criado `docs/HOMOLOGACAO-LOCAL.md`: sequência numerada (stack → 459 migrations → BIL → fixture → Playwright → homologação manual na interface → regeneração de tipos → regressão) com a evidência exigida em cada passo.

### Veredito acumulado
Todo o caminho de homologação está destravado e roteirizado; a execução final depende da máquina do usuário (Docker Desktop com 6 GB). Critérios de aceite seguem **não atendidos integralmente** até a evidência dos passos 1–7 do roteiro ser arquivada.

## Rodada 8 — Painel do Gerente com dados reais (2026-10-19)

- Nova aba **Painel do Gerente** no PCPPanel existente (sem duplicar módulo): `src/modules/production/pcp/ManagerPanel.tsx` + agregações puras em `src/lib/pcp/managerMetrics.ts` (fórmulas documentadas no código e na tela) + hook `useManagerPanelData` (lotes com saldo e picking WMS da empresa). Indicadores: OPs abertas/concluídas/atrasadas, produção e rendimento **por unidade**, aprovação de qualidade (unidades mistas → "Sem dados suficientes"), janelas de hoje, OPs sem programação, conflitos de capacidade, OPs por setor, saldo por lote, lotes bloqueados e expedido por lote em 7 dias, com drill-down para Ordens e Programação.
- Testes: `managerMetrics.test.ts` 7/7 (inclui o dataset da cadeia e os casos honestos de unidade mista/sem dados); contrato Node do painel (sem `Math.random`, com fórmulas e "Sem dados suficientes").
- **Prova com dados reais**: Parte 6 da jornada embarcada confere em SQL os mesmos números sobre a cadeia produzida — 4 OPs concluídas em 30 dias (m: 95 produzidos/95% de rendimento; kg: 255/15/94,4%), 1 OP atrasada, 0 sem programação, pluma 382 kg, malha tingida 25 kg pós-expedição, 2 lotes bloqueados com saldo, 50 kg expedidos em 7 dias, conclusões 1 por setor (Fiação/Malharia/Tecelagem/Tinturaria) e reprogramação para hoje refletida. **Jornada total: 104/104 PASS; replay 459/459.**
- Typecheck `typecheck:weaving` e ESLint dos arquivos novos: PASS. Contratos Node: 81/81.

### Veredito acumulado
Produção, qualidade, estoque, expedição e agora **indicadores gerenciais** estão comprovados sobre os mesmos dados reais, sem número inventado. Resta a homologação na máquina do usuário (`docs/HOMOLOGACAO-LOCAL.md`).
