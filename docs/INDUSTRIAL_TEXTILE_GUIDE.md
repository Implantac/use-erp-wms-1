# Guia operacional industrial têxtil — USE ERP-WMS

## Estado de uso

Este guia descreve a jornada **PCP de tecelagem implementada e comprovada em PostgreSQL embarcado isolado**. A conclusão direta de OP por edição de status continua bloqueada; a conclusão válida é a transação `complete_production_order`, chamada pela **Execução PCP** da OP.

**Limite honesto:** as migrations `20261019100000` e `20261019110000` ainda não foram aplicadas na stack Docker do usuário nem homologadas pela interface em banco representativo. Portanto, o status operacional é **implementado e testado em harness isolado; não homologado para uso real** até aplicar as migrations no ambiente local, regenerar os tipos do Supabase e executar a jornada E2E com fixture de homologação.

Consulte também `docs/governance/INDUSTRIAL_TEXTILE_AUDIT_2026-10-19.md` e `tests/e2e/textile-weaving-pcp.spec.ts`. A checagem de tipos direcionada do fluxo é `npm run typecheck:weaving`.

## 1. Perfis industriais

A configuração fica em **Administração → Configuração da Empresa → Planejamento industrial** e é salva em `companies.settings.industrial`.

| Perfil desejado | Valor de perfil | Famílias/etapas típicas a levantar |
|---|---|---|
| A — Fiação e tecelagem | `spinning_weaving` | preparação da fibra, fiação, tecelagem |
| B — Tecelagem e tinturaria | `weaving_dyeing` | tecelagem, tinturaria |
| C — Tinturaria e acabamento | `dyeing_finishing` | tinturaria, acabamento |
| D — Integrada | `integrated_textile` | preparação, fiação, tecelagem/malharia, tinturaria, acabamento |

Para cada etapa, escolha **Interna**, **Terceirizada** ou **Não utilizada**. O perfil organiza planejamento e apresentação; ele não concede permissão, não cria receita, não libera estoque e não substitui RLS.

A BIL é cadastrada com perfil **B — Tecelagem e tinturaria** (`weaving_dyeing`), segmento têxtil e todos os módulos/permissões de produção liberados pelo seed local.

## 2. Sequência segura de configuração

1. Confirme empresa e unidade produtiva ativas.
2. Selecione o perfil e as famílias efetivamente usadas.
3. Cadastre setores, linhas, máquinas/teares e recursos nos módulos de Produção existentes.
4. Cadastre capacidade nominal por setor/máquina/turno. Não trate `current_load_pct` manual como telemetria.
5. Cadastre produtos e unidades reais. Não converta kg, m, rolo, cone ou peça sem regra aprovada por artigo/lote.
6. Cadastre ficha técnica, BOM e roteiro. BOM, roteiro, receita química e especificação de qualidade são conceitos distintos; não use um campo genérico para todos.
7. Configure etapas e pontos de inspeção. Uma inspeção registrada não significa lote liberado sem critério e decisão formal.
8. Crie a OP de tecelagem pela tela própria para congelar snapshot, gerar etapas e gravar o perfil do tear.
9. Reserve lotes, programe a janela finita, aponte as etapas em sequência, decida a qualidade e só então conclua pela Execução PCP.

## 3. Jornada PCP de tecelagem

### 3.1 Criação da OP com snapshot

Use **Produção → Ordens de Produção → Nova OP de tecelagem** ou **Central PCP — Tecelagem → Nova OP de tecelagem**.

A RPC `create_textile_production_order`:

- valida usuário, empresa, produto, BOM e roteiro ativos;
- numera a OP pela sequência da empresa;
- gera `production_order_steps` a partir do roteiro;
- congela `technical_snapshot`, `technical_snapshot_at` e `technical_snapshot_hash` na OP;
- aplica, quando informado, o perfil de tecelagem (`weaving_order_profiles`): tear/recurso/máquina, fios de urdume/trama, rolo de urdume, pente, batidas/cm, fios de urdume, largura, comprimento e setup — sempre valores configurados, nunca presumidos;
- é idempotente pela chave enviada pela tela: reenviar a mesma criação retorna a mesma OP.

OPs legadas sem snapshot usam a BOM atual apenas como fallback operacional. A tela declara essa condição; não afirma equivalência histórica.

### 3.2 Reserva de materiais por lote

Na aba **Execução PCP** da OP (ou na Central de Tecelagem), o painel **Reserva de materiais por lote**:

- calcula a necessidade planejada por componente: `restante da OP × quantidade da BOM/snapshot × (1 + perda%)`;
- lista somente lotes `available` com qualidade aprovada/liberada e saldo disponível;
- chama `reserve_production_materials`, que trava ordem/lotes, valida empresa, qualidade e `quantity - reserved_qty` de `stock_balances`;
- grava `production_material_reservations` e incrementa somente o reservado — **não cria segundo ledger** e não movimenta físico antes da conclusão;
- permite liberar a reserva por `release_production_material_reservation`.

Lote em quarentena/rejeitado/bloqueado é rejeitado no banco, não apenas desabilitado na tela.

### 3.3 Programação finita

Em **Produção → Programação**, a RPC `schedule_production_order`:

- recebe OP, janela, recurso cadastrado, máquina/tear, centro textual, setor e turno;
- usa lock transacional por chave de recurso e rejeita sobreposição para o mesmo recurso/máquina/centro;
- grava `resource_id`/`machine_id` em `production_schedule` e é idempotente por chave;
- **não conclui a OP**: iniciar/encerrar janela altera só a janela; cancelar libera a capacidade (`cancel_production_schedule`).

A lista mostra conflitos visíveis e janelas sem recurso validável. A garantia contra dupla alocação está no banco.

### 3.4 Apontamento sequencial de etapas

Nos painéis de etapas da OP, em **Produção → Etapas** e no **Terminal do Operador**, o apontamento usa `record_production_step_progress`:

- ações `start`, `progress`, `pause` e `complete`, com quantidades **incrementais**;
- a etapa seguinte só recebe meta da quantidade boa concluída na etapa anterior;
- concluir etapa com pendência é rejeitado; apontar além da meta é rejeitado;
- o terminal sincroniza pausa/retomada da etapa com o registro de tempo e nunca avança a OP por update direto;
- `useProductionSteps.updateOrderStep` falha fechado: apontamento direto fora da RPC está desativado.

### 3.5 Perfil e eventos do tear

O painel **Perfil técnico de tecelagem da OP** salva tear, urdume/trama e parâmetros configurados via `upsert_weaving_order_profile`.

O painel **Eventos e paradas do tear** registra eventos manuais auditáveis (`record_weaving_event`): setup, início, pausa, retomada, parada, rupturas de fio/urdume/trama, troca de rolo, bloqueio/liberação de qualidade, inspeção e observação, com metros, minutos de parada, motivo e operador. Sem integração de sensor configurada e validada, a origem é sempre este apontamento manual — nenhuma leitura sintética é apresentada como telemetria.

### 3.6 Qualidade formal

Em **Produção → Qualidade** e na aba Execução PCP da OP:

- a consulta é limitada à empresa ativa e usa a unidade da OP vinculada;
- totais e taxa de defeito só agregam inspeções de mesma unidade conhecida: `rejeitado ÷ (aprovado + rejeitado)`;
- a decisão formal usa `decide_production_quality_inspection` (`approved`, `quarantine`, `rejected`, `open`);
- aprovar exige quantidade aprovada > 0; rejeitar/quarentenar exige motivo ou ação corretiva;
- inspeção bloqueada/rejeitada/quarentena impede a conclusão da OP.

Ainda faltam plano de inspeção por artigo/processo/cliente, critérios automáticos, CIELAB/ΔE, NC formal completa e liberação de lote fora do fluxo da OP.

### 3.7 Conclusão transacional e genealogia

O painel **Conclusão transacional da OP**:

- exige OP em execução/acabamento/qualidade, todas as etapas concluídas e qualidade aprovada suficiente;
- baixa os lotes alocados no ledger `stock_movements`, consome primeiro as reservas da própria OP e libera o excedente reservado;
- cria o lote de saída (número informado ou gerado), grava `material_consumptions` com lote/conclusão/movimento e arestas `production_lot_genealogy` entrada → saída;
- conclui a OP na mesma transação; replay com a mesma chave não duplica movimentos, consumo ou genealogia;
- escrita direta de `production_orders.status = 'completed'` continua rejeitada pelo trigger de guarda.

`output_quantity` da genealogia é a quantidade total do lote de saída em cada aresta; some `input_quantity` para consumo, nunca `output_quantity` por insumo.

### 3.8 Consumo de materiais

**Produção → Consumo de Materiais** é uma visão somente leitura do ledger/consumos. Baixas manuais foram removidas: consumo físico só nasce da conclusão transacional, para não duplicar baixa nem perder lote/genealogia.

## 4. MRP líquido

Em **Produção → MRP**, a aba principal usa `calculateNetMaterialNeeds`:

- necessidade bruta por componente = restante da OP × BOM × (1 + perda);
- a BOM usada é o **snapshot congelado da OP** quando existe; BOM atual é fallback de OP legada;
- disponível exclui reservado (`reserved_qty`), saldo bloqueado e saldo sem qualidade conhecida/liberada;
- entradas abertas somam `quantity - received_quantity` somente de compras em status aberto válido (`sent`, `confirmed`, `approved`, `partial`, `partially_received`); rascunho aparece separado e não conta como recebimento;
- líquido = `máx(0, bruta + estoque mínimo − disponível − entradas abertas)`;
- sugestão de compra arredonda para cima pelo `standard_batch_size` quando configurado; lead time e risco de atraso vêm do cadastro do produto e da data requerida.

A aba **Compra** gera **um** pedido em rascunho pela RPC `generate_mrp_purchase_order`, idempotente por chave: reenviar retorna o mesmo pedido. Nenhum custo estimado é fabricado; preço só entra se informado no fluxo de compras.

## 5. Dashboards

- **Central PCP — Tecelagem** (`/vertical/weaving`): OPs ativas, componentes com déficit líquido, janelas finitas ativas, OPs concluídas e checklist de prontidão da OP selecionada (snapshot, BOM/lotes, programação, etapas, qualidade, genealogia) a partir de consultas reais. Se nenhuma OP está marcada como tecelagem/tear, a tela avisa e lista todas apenas para seleção manual, sem classificá-las como tecelagem. Quantidades de unidades diferentes não são somadas.
- **Dashboard Têxtil** (`/vertical/textile`): hub com contagens reais de OPs/programação e links operacionais. Não estima eficiência de tear, metros/hora ou OEE.
- **Dashboard Industrial**: OPs abertas/atrasadas, avanço médio e qualidade calculados dos registros da empresa, com “Sem dados suficientes” quando não há base comparável.

## 6. Rastreabilidade

A conclusão persiste arestas lote de entrada → lote de saída em `production_lot_genealogy`, consultáveis na Execução PCP da OP. A tela ampla de rastreabilidade e o vínculo com expedição/cliente ainda não foram homologados; não use a genealogia da OP como prova de recall completo até consultar ancestrais/descendentes e saldo atual de um lote expedido.

Divisões, fusões e fracionamentos precisam manter lote pai, quantidade, unidade, documento, operação e data.

## 7. Homologação antes do uso real

Execute em ambiente isolado, com fixtures determinísticas e duas empresas:

1. Aplicar as migrations `20261019100000` e `20261019110000` na stack local e regenerar `src/integrations/supabase/types.ts`.
2. Cadastrar matéria-prima e receber com lote/local/documento.
3. Conferir saldo físico, reservado, bloqueado e disponível.
4. Criar BOM/roteiro versionados e OP de tecelagem com snapshot.
5. Reservar por lote; tentar lote em quarentena e saldo insuficiente.
6. Programar duas OPs no mesmo tear/horário e confirmar a rejeição da segunda.
7. Apontar produção parcial e total em sequência; tentar concluir etapa pendente.
8. Registrar inspeção, quarentenar, corrigir, reinspecionar e aprovar formalmente.
9. Concluir a OP pela Execução PCP e repetir a mesma requisição (replay).
10. Conferir lote de saída, consumo, reservas consumidas/liberadas, genealogia e movimentos do ledger.
11. Separar, conferir e expedir; consultar genealogia de origem e destino.
12. Repetir com concorrência pelo mesmo lote/recurso, máquina indisponível, cancelamento formal e tentativa de acesso da outra empresa.

A jornada automatizada dessa sequência está em `tests/e2e/textile-weaving-pcp.spec.ts`. A massa de homologação (empresa isolada, usuário, artigo/BOM/roteiro e lote) é criada por `tests/e2e/fixtures/weaving-fixture.sql` (idempotente; comprovada 11/11 em Postgres embarcado simulando a spec) e a sequência completa de homologação na máquina local está em `docs/HOMOLOGACAO-LOCAL.md`. Ela exige `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `E2E_WEAVING_EMAIL`, `E2E_WEAVING_PASSWORD`, `E2E_WEAVING_PRODUCT_ID`, `E2E_WEAVING_COMPONENT_ID` e `E2E_WEAVING_LOT_ID` apontando para uma empresa de homologação migrada; sem essas variáveis, o teste é ignorado explicitamente e **não conta como homologação**.

Enquanto esses passos não passarem no ambiente do usuário com efeitos persistidos, o status correto é **não homologado**.

## Indicadores do Painel do Gerente (PCP → Painel do Gerente)

Todos calculados de consultas reais da empresa ativa (`src/lib/pcp/managerMetrics.ts`); sem amostra válida, a tela mostra **"Sem dados suficientes"** — nenhum número é estimado.

| Indicador | Fórmula | Fonte |
|---|---|---|
| OPs abertas | status fora de concluída/cancelada | `production_orders` |
| Concluídas (30 dias) | contagem por `completed_date` na janela | `production_orders` |
| Produção por unidade | produzido/rejeitado somados **por unidade** (nunca somar m com kg); rendimento = produzido/(produzido+rejeitado) | OPs concluídas na janela |
| Aprovação de qualidade | aprovada/(aprovada+rejeitada); unidades mistas → sem indicador | `quality_inspections` + unidade da OP |
| OPs atrasadas | abertas com `due_date` vencida | `production_orders` |
| OPs sem programação | abertas programáveis sem janela `scheduled`/`in_progress` | `production_orders` + `production_schedule` |
| Conflitos de capacidade | janelas ativas sobrepostas no mesmo recurso/máquina/centro | `production_schedule` (`detectScheduleConflicts`) |
| Saldo por lote | soma de `remaining_qty` por produto | `stock_lots` |
| Lotes bloqueados | quarentena/rejeitado/bloqueado ainda com saldo | `stock_lots.quality_status` |
| Expedido (7 dias) | soma por produto dos movimentos de picking | `stock_movements` (`source='wms_pick'`, com lote) |

Prova com dados reais: a Parte 6 de `scripts/live-manager-journey.mjs` confere esses números em SQL sobre a cadeia pluma→fio→malha→tingido→expedição (104/104).
