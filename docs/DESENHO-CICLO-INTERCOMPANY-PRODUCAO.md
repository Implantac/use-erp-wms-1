# Desenho de contrato — ciclo intercompany por produção (LOJ-05 / LOJ-06)

- **Status:** proposta técnica para revisão. **NÃO implementada**, nenhuma migration aplicada.
- **Data:** 05/11/2026.
- **Baseline:** `main` em `5982a06422efdfac0d655f5e88d8b244ea496b74` (código de intercompany idêntico a `8a5dbb35`).
- **Plano-mestre:** [PLANO-MESTRE-LOJAS-PCP-TEXTIL.md](PLANO-MESTRE-LOJAS-PCP-TEXTIL.md), seções 4.1, 7 e 8.1.
- **Parecer de due diligence:** [Avaliação técnica para aquisição — 05/11/2026](AVALIACAO-TECNICA-ERP-2026-11-05.md) (achado DD-04; versionado em 09/11/2026, antes apenas local).
- **Estado de produção:** **NO-GO**.

---

## 1. Problema que este desenho resolve

Estado atual confirmado em código:

| Fato | Evidência |
| --- | --- |
| `produzir` cria e vincula uma OP atomicamente | `20261105150000_atomic_intercompany_production.sql` → `produce_intercompany_request` (P0-03, concluído) |
| A solicitação fica em `producao_solicitada` | mesma migration, `UPDATE ... SET status = 'producao_solicitada'` |
| `factory_inbox` apenas **lista** essas solicitações e o status da OP | mesma migration, seção `production` |
| Nenhum consumidor usa `production_order_id` para avançar o ciclo | busca em `src/` e migrations: só a migration de criação e a caixa de entrada referenciam o vínculo |
| Recebimento exige apenas `aprovada` | `20261019220000_group_intercompany.sql` → `receive_intercompany_delivery` |
| Recebimento não consulta expedição, `sales_order_id` ou lote | RPC insere diretamente em `stock_movements` (`type = intercompany_in`) |
| `p_quantity` só precisa ser `> 0` | não há teto contra quantidade solicitada, expedida ou restante |
| Recebimento encerra a solicitação em um único lançamento | `SET status = 'recebida', received_quantity = v_qty` |

Consequência: **o caminho `produzir` não tem fim**, e o caminho `vender/transferir_cd/remanejar` permite entrada de estoque sem lastro de saída e sem controle de over-receipt. Não é regressão de P0-03: é a etapa seguinte que nunca foi desenhada.

---

## 2. Objetivo e não-objetivos

**Objetivo:** um único ciclo auditável, idempotente e com quantidades conciliadas, que sirva tanto à decisão `produzir` quanto às decisões comerciais, com expedição obrigatória antes do recebimento.

**Não-objetivos (fora deste desenho):**

- emitir NF-e/NFC-e ou definir regras fiscais entre CNPJs (depende de EXT-01 e da contabilidade do cliente);
- automatizar a decisão do gestor ou dispensar aprovação;
- criar IA, previsão, OEE ou telemetria;
- alterar P0-02/P0-03, o ledger `stock_movements` ou o motor de conclusão de OP;
- aplicar qualquer migration antes de harness e ambiente isolado (QA-01).

---

## 3. Máquina de estados proposta

```
                         ┌── rejeitar ──> rejeitada
                         │
pendente ── decidir ─────┼── vender / transferir_cd / remanejar ──> aprovada ──┐
                         │                                                     │
                         └── produzir ──> producao_solicitada ──> producao_concluida
                                              (OP vinculada)              │
                                                                         v
                                                              disponivel_expedicao
                                                                         │
                              ┌──────────────────────────────────────────┘
                              v
                        expedida (parcial) ──> expedida ──> recebida
                              │                              │
                              │                              └──> recebida_com_divergencia
                              └──> cancelada (antes de qualquer recebimento)
```

Regras deState:

1. `producao_concluida` só é alcançada quando a OP vinculada estiver concluída pelo motor atual (`complete_production_order`), com produto acabado e lote elegível.
2. `disponivel_expedicao` exige **pedido de venda intercompany e reserva** criados uma única vez a partir da solicitação (mesmo mecanismo hoje usado em `aprovada`, porém no momento correto).
3. `aprovada` (caminhos comerciais) passa a exigir também um registro de expedição antes de qualquer recebimento — sem expedição, não há `recebida`.
4. `recebida_com_divergencia` é estado terminal com falta/avaria/excesso registrado; não é "recebida com número arredondado".
5. `cancelada` só é permitida antes do primeiro recebimento e exige estorno/reserva liberada.

**Compatibilidade:** registros legados em `aprovada` sem expedição não devem ser promovidos automaticamente. Prever migração de dados com decisão explícita por solicitação, ou janela de reconciliação manual, antes de endurecer a RPC.

---

## 4. Vínculos e entidades

| Vínculo | Obrigatório | Finalidade |
| --- | --- | --- |
| `intercompany_replenishment_requests.production_order_id` | sim, no caminho `produzir` | Já existe (P0-03); passa a ser consumido |
| `...sales_order_id` | sim, antes de expedir | Pedido de venda entre CNPJs; hoje só existe nos caminhos comerciais |
| `intercompany_deliveries` **(novo)** | sim | Uma expedição por solicitação/item/lote, com quantidade e `idempotency_key` |
| `intercompany_delivery_receipts` **(novo)** | sim | Recebimentos parciais acumuláveis, com divergência e `idempotency_key` |
| `stock_lot_units` / lote de saída | sim quando aplicável | Rastreabilidade e baixa correta na origem |
| `stock_movements` (saída na origem + entrada no destino) | sim | Ledger único, sem lançamento órfão |

**Decisão em aberto D1:** antes de criar `intercompany_deliveries`, avaliar reuso de `stock_transfer_orders` / `stock_transfer_shipments` (fluxo mesmo CNPJ já implementado). Se houver compatibilidade de estados e RLS, estender em vez de duplicar. O desenho não fixa a tabela, fixa o **contrato**: identificar expedição, quantidade e restante.

**Decisão em aberto D2:** quem dispara `producao_concluida` — trigger na conclusão da OP, job na caixa de entrada ou ação explícita do gestor. A recomendação é **ação explícita + idempotência**, para não transformar conclusão de OP em efeito fiscal/logístico automático.

---

## 5. Invariantes (servidor, nunca na tela)

| ID | Invariante |
| --- | --- |
| **I1** | Uma solicitação gera no máximo uma OP e no máximo um pedido de venda intercompany; replay não duplica nenhum dos dois. |
| **I2** | `produzir` só cria pedido/reserva depois que a OP vinculada estiver concluída e o produto acabado existir. |
| **I3** | Nenhuma expedição sem solicitação em estado elegível e sem pedido de venda/reserva válidos. |
| **I4** | `SUM(quantidade_expedida) <= quantidade_solicitada` (ou `quantidade_produzida_aprovada`, quando produção). |
| **I5** | Nenhum recebimento sem `delivery_id`; a expedição deve pertencer à mesma solicitação, produto e empresas. |
| **I6** | `SUM(quantidade_recebida por entrega) <= quantidade_expedida`; over-receipt é rejeitado com erro de domínio. |
| **I7** | Replay com a mesma `idempotency_key` retorna o mesmo resultado, sem segundo lançamento no ledger. |
| **I8** | Somente a loja solicitante recebe; somente a indústria/matriz decide, produz e expede; RLS e `user_roles` validados no servidor. |
| **I9** | Cada recebimento gera exatamente uma entrada no ledger, referenciando a saída correspondente; saldos derivados por trigger, nunca escritos diretamente. |
| **I10** | Falta, excesso não autorizado, avaria e cancelamento ficam registrados com quantidade, motivo, usuário e data; encerramento é explícito. |
| **I11** | Concorrência: `SELECT ... FOR UPDATE` na solicitação e na expedição; duas confirmações simultâneas não ultrapassam o restante. |
| **I12** | Cancelamento após expedição exige estorno da saída e liberação de reserva na mesma transação. |

---

## 6. RPCs propostas

Todas `SECURITY DEFINER`, com `SET search_path = public, pg_temp`, `REVOKE ... FROM PUBLIC, anon` e `GRANT` apenas a `authenticated` + validação interna de papel/empresa.

| RPC | Entrada | Responsabilidade | Retorno |
| --- | --- | --- | --- |
| `finalize_intercompany_production(p_request_id uuid)` | solicitação | Verifica OP concluída; cria pedido de venda + reserva uma única vez; move para `disponivel_expedicao` | `{status, sales_order_id, production_order_id, idempotent_replay}` |
| `ship_intercompany_delivery(p_request_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL, p_idempotency_key text)` | solicitação, quantidade, lote | Valida estado e I4; cria expedição; lança saída no ledger na origem; move para `expedida` | `{delivery_id, quantity, remaining}` |
| `receive_intercompany_delivery(p_request_id uuid, p_delivery_id uuid, p_quantity numeric, p_divergence jsonb DEFAULT '{}', p_idempotency_key text)` | entrega, quantidade, divergência | Substitui a RPC atual; valida I5–I9; lança entrada; acumula; encerra em `recebida` ou `recebida_com_divergencia` | `{status, received_total, remaining, divergence}` |
| `cancel_intercompany_request(p_request_id uuid, p_reason text)` | solicitação | Estados permitidos; estorno e liberação de reserva (I12) | `{status, reversed_movement_id}` |

**A RPC `receive_intercompany_delivery` atual deve ser substituída, não apenas estendida.** Manter a assinatura antiga como compatibilidade permitiria recebimento sem expedição; se houver clientes externos, criar um período de transição com recusa explícita e mensagem orientando a nova assinatura.

---

## 7. Matriz de transições

| De | Ação | Para | Pré-condição | Bloqueio |
| --- | --- | --- | --- | --- |
| `pendente` | `produzir` | `producao_solicitada` | gestor da matriz; produto/BOM válidos | já decidida / outro papel |
| `pendente` | `vender` etc. | `aprovada` | gestor da matriz; produto na vendedora | origem = destino / fora do grupo |
| `producao_solicitada` | `finalize...` | `disponivel_expedicao` | OP concluída; lote liberado | OP em andamento / replay duplicado |
| `disponivel_expedicao` / `aprovada` | `ship...` | `expedida` | pedido/reserva válidos; saldo na origem | quantidade > solicitada / sem lote liberado |
| `expedida` | `receive...` | `expedida` ou `recebida` | delivery válido; quantidade ≤ restante | over-receipt / outra empresa / replay sem chave |
| `expedida` | `receive...` com divergência | `recebida_com_divergencia` | falta/avaria registrada | divergência sem motivo |
| qualquer antes do 1º recebimento | `cancel...` | `cancelada` | gestor autorizado | já recebido sem estorno |

---

## 8. Matriz de testes exigida (harness + E2E)

| # | Cenário | Esperado |
| --- | --- | --- |
| T1 | `produzir` duas vezes concorrentes | 1 OP, 1 vínculo, replay idempotente |
| T2 | OP concluída → finalize → ship → receive | estados na ordem; ledger com saída + entrada; saldos conciliados |
| T3 | finalize em replay | mesmo `sales_order_id`, sem segundo pedido |
| T4 | ship com quantidade acima da solicitada | rejeitado (I4), transação revertida |
| T5 | receive sem `delivery_id` ou de outra solicitação | rejeitado (I5) |
| T6 | receive acima do expedido / do restante | rejeitado (I6), sem lançamento |
| T7 | recebimentos parciais 30 + 20 de 50 | restante 0; status `recebida`; um lançamento por recebimento |
| T8 | replay de receive com mesma chave | mesmo resultado, sem duplicidade no ledger (I7) |
| T9 | duas confirmações simultâneas sobre restante 10 | apenas uma soma 10; segunda rejeitada (I11) |
| T10 | usuário da loja B tenta receber pela loja A | negado por empresa/papel (I8) |
| T11 | falta/avaria com motivo | `recebida_com_divergencia`, quantidade e motivo persistidos (I10) |
| T12 | cancelamento após expedição, antes de receber | saída estornada, reserva liberada, nada pendente (I12) |
| T13 | caminho `vender` sem expedição | recebimento recusado; sem entrada órfã |
| T14 | solicitação legada `aprovada` sem expedição | não promovida automaticamente; reconciliação explícita |
| T15 | E2E por cliques: produzir → concluir OP → expedir → receber parcial → encerrar | efeitos persistidos, saldos e tela conferindo com banco |

Nenhum teste `fixme`, `skip` ou job autenticado falho conta como aceite.

---

## 9. Decisões em aberto (bloqueiam a migration)

| ID | Decisão | Responsável |
| --- | --- | --- |
| D1 | Reusar `stock_transfer_orders` ou criar `intercompany_deliveries` | Arquitetura |
| D2 | Disparo de `finalize`: trigger, job ou ação explícita | Produto + PCP |
| D3 | Tratamento fiscal entre CNPJs (CFOP, CST, emissão no momento da expedição) | Contabilidade do cliente / EXT-01 |
| D4 | Regra de divergência: excesso sempre recusado ou aceito com autorização | Operações |
| D5 | Destino de registros legados `aprovada` sem expedição | DBA + Operações |
| D6 | Lote obrigatório por item ou opcional por produto | PCP / Qualidade |
| D7 | Cancelamento com NF-e já emitida | Fiscal |

**Sem D1–D7 resolvidas, não escrever a migration.** O plano-mestre coloca a implementação do ciclo depois de QA-01 exatamente para que essas decisões e o ambiente isolado existam antes do código de banco.

---

## 10. Dependências e critério de saída

**Dependências:** LOJ-04/P0-03 (concluído) → este desenho aprovado → QA-01 (ambiente isolado) → implementação das RPCs + harness → QA-02 (E2E de lojas) → SEC-01 (RLS/RBAC) → EXT-01 (fiscal) → piloto.

**Sai de "pendente" no plano-mestre somente quando:**

- D1–D7 registradas e aprovadas;
- migration aplicada em banco isolado e reaplicável do zero;
- T1–T15 verdes, com relatório identificado por commit/ambiente/data;
- nenhum recebimento sem expedição e nenhum over-receipt possível;
- reconciliação solicitação ↔ OP ↔ pedido ↔ reserva ↔ expedição ↔ ledger ↔ lote ↔ saldo conferida;
- tela por cliques executada e aceita;
- plano-mestre e índice atualizados na mesma mudança.

---

## 11. O que não fazer

- **Não** trocar `producao_solicitada` por `aprovada` para "fechar" o ciclo: isso criaria recebimento sem OP concluída e sem lastro.
- **Não** manter a RPC de recebimento atual em paralelo à nova.
- **Não** aplicar migration em produção nem publicar app como prova do ciclo.
- **Não** usar `service_role` na tela nem confiar em validação client-side.
- **Não** contar harness como homologação de usuário.
