# Revisão do fluxo operacional de controle de lojas

**Data:** 2026-10-21 · Escopo: operação de lojas ponta a ponta (filiais do
mesmo CNPJ e empresas do grupo), da política de reposição ao inventário.

## O fluxo como ele deve operar (e agora opera)

| Etapa | Ator | Tela/serviço | Backend (verdade) |
|---|---|---|---|
| Política por produto/unidade | Gestor | Políticas de reposição | `replenishment_policies` (mín, máx, segurança, lead time, origem padrão) |
| Necessidade detectada | Sistema | Motor `replenishmentEngine` | Cobertura projetada (saldo + trânsito − demanda) × política; sugere origem: fábrica, CD ou loja com sobra |
| Loja solicita | Loja | Central da Loja → Solicitar mercadoria | `create_stock_transfer_request` (atômica) → `stock_transfer_orders` **SUGERIDA** |
| Gestor decide | Gestor | Fila da rede (supply chain) / aprova na transferência | `transition_stock_transfer`: **APROVADA** só admin/manager; ou REJEITADA |
| Separação e expedição | CD/origem | Reserva → separação → conferência → expedição | Transições no servidor; **EXPEDIDA** lança `transfer_out` no ledger e baixa a origem |
| Trânsito | — | Acompanhamento por status | `EM TRÂNSITO` (saldo já saiu da origem; conferência no destino) |
| Recebimento conferido | Loja | Central da Loja → Conferir recebimento | **RECEBIDA**: `transfer_in` pela quantidade conferida; falta vira **RECEBIDA COM DIVERGÊNCIA** automática |
| Perda/ocorrência | Loja | Registrar perda | `register_stock_loss` (baixa com motivo no ledger) |
| Inventário | Loja | Contagem de inventário | `register_inventory_count` (lança só a diferença; devolve sistema × contado × delta) |
| Grupo (CNPJs) | Loja/gestor | Painel do grupo (lote anterior) | Solicitação intercompany → pedido de venda → recebimento pelo ledger |

## O que a revisão encontrou (e o destino de cada item)

| # | Achado | Gravidade | Destino |
|---|---|---|---|
| F1 | **Fluxo de transferências congelado sem a transação prometida**: a migration `20261008223000` bloqueou INSERT/transição de `stock_transfer_orders` para `authenticated` até existir a operação atômica no servidor — que não existia. A loja **não conseguia nem criar** a solicitação; `transferWorkflow.transition` lançava erro; `createTransfer`/`registerLoss` eram stubs que lançavam erro | **P0** | ✅ **Corrigido**: GUC oficial `app.stock_transfer_rpc`, RPCs `create_stock_transfer_request`, `transition_stock_transfer`, `register_stock_loss`, `register_inventory_count`; front e serviços legados religados |
| F2 | Gatilho legado `process_stock_transfer` esperava status em inglês (`IN_TRANSIT`/`COMPLETED`) e escrevia saldo direto — nunca disparava com os status em português e duplicaria o ledger | P1 | ✅ Aposentado (DROP) na mesma migration |
| F3 | Criação da solicitação **auto-aprovava** no front (SUGERIDA → APROVADA imediato), furando a decisão do gestor | P1 | ✅ Corrigido: nasce SUGERIDA; aprovação exige admin/manager **no servidor** |
| F4 | Página da loja com **números de demonstração fixos** (KPI "3", `TR-00182`, `REQ-00143`, divergência fictícia) | P1 | ✅ Substituídos por consultas reais (`StoreTransfersPanel`, KPIs do `storeService`) |
| F5 | Os 4 diálogos da loja (solicitar, receber, perda, inventário) **não tocavam o banco** | **P0** | ✅ Reescritos sobre as RPCs oficiais |
| F6 | Abas `recebimentos`, `transferencias`, `estoque`, `ocorrencias` da Central da Loja **não renderizam conteúdo** | P1 | Registrado: montar sobre `StoreTransfersPanel`/matriz (o dado já existe); `solicitacoes` e `resumo` estão reais |
| F7 | `storeService.getStoreKPIs` conta "em trânsito" pela coluna legada `status='IN_TRANSIT'` (enum antigo), não por `current_status='EM TRÂNSITO'` — o KPI tende a 0 | P2 | Registrado para correção junto do F6 |
| F8 | Teste unitário fixava o comportamento congelado ("rejeita tudo") | — | ✅ Atualizado para o novo contrato (delegação às RPCs + máquina de estados) |

## Provas deste lote (harness, 465 migrations — 77/77 PASS)

- INSERT direto de transferência continua **bloqueado** (só a RPC oficial);
- Loja cria SUGERIDA; usuário comum **não aprova** (42501); gestor aprova;
- Salto de etapa (APROVADA → EXPEDIDA) rejeitado pela máquina (55000);
- Cadeia completa RESERVADA → SEPARAÇÃO → CONFERÊNCIA → **EXPEDIDA**
  (origem −10 pelo ledger) → EM TRÂNSITO → **RECEBIDA com 9/10** vira
  divergência automática (+9 no destino), com 7+ eventos de histórico na
  mesma transação;
- Perda −2 por AVARIA e inventário 35 → 30 lançando só o delta, tudo em
  `stock_movements` (ledger único), com saldo conferido em `stock_balances`.

Frontend: typecheck integral limpo; **297 testes** verdes (68 arquivos).

## Leitura operacional (resumo para o gestor)

Antes desta revisão, o "controle de lojas" era uma fachada convincente com
o miolo desligado por segurança. Agora o caminho feliz e os desvios
(divergência, perda, contagem) executam no servidor, com autoria, histórico
e saldo derivado de um único livro de movimentações — o mesmo padrão do
PCP têxtil e do grupo multi-CNPJ. O que falta é acabamento de tela (F6/F7)
e a homologação em campo com uma loja piloto.
