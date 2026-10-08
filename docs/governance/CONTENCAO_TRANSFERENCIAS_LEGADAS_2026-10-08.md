# Contenção da transferência legada e do ajuste direto de estoque

**Status: código corrigido e migration publicada somente após commit; ainda NÃO aplicada/testada em Supabase. Não habilitar produção.**

## Problema observado

`transferWorkflow.transition` fazia log, update de status, publicava evento e então chamava vários `adjust_stock` e atualizava itens em **requisições independentes**; erros de RPC de estoque eram ignorados. Timeout/erro em qualquer fase podia deixar status, estoque e log incoerentes. `transferService.createTransfer` inseria cabeçalho e itens separadamente, tentava apagar cabeçalho se itens falhassem e podia autoaprovar; cancelamento concorrente/erro também gerava órfãos. `storeService.registerLoss` escrevia ledger antes de chamar `adjust_stock` e retornava `success:false` sem desfazer ledger. `SalesOrchestrator.completeSale` completava pedido e anunciava estoque/financeiro via barramento em memória sem efeitos confirmados. Orquestradores montados em `App.tsx` ainda anunciavam título/baixa e criavam tarefas com limite arbitrário ao carregar a loja.

## Contenção aplicada no código

- `SalesOrchestrator.completeSale`, `transferWorkflow.transition`, `transferService.createTransfer` e `storeService.registerLoss` rejeitam antes de qualquer gravação.
- `LossDialog` avisa que não registra perda; assinaturas automáticas de Inventory/Financial/Fiscal/Store Orchestrator foram removidas do `App` para não simular efeitos e criar tarefas na abertura. A leitura de alertas de baixa margem existente permanece.
- `useSupplyChainExecution` não tenta inserir ledger separado após uma transição; este fluxo depende da trilha validada no servidor no futuro.
- Migration `20261008223000_block_nonatomic_stock_transfer_workflow.sql` bloqueia INSERT/DELETE e alterações de `current_status` de `stock_transfer_orders` por `authenticated`, revoga escrita autenticada de `stock_transfer_items` e execução autenticada do `SECURITY DEFINER adjust_stock`. **Guardas de cliente sozinhas podem ser burladas por chamadas REST/RPC diretas; só após aplicação e teste da migration haverá contenção no banco.** Outras APIs capazes de ajustar saldos devem ser inventariadas. A migration interromperá fluxos legados que usem essas operações, deliberadamente.

## Critério de reativação

Definir escopo e responsáveis operacionais; implementar RPC transacional `SECURITY INVOKER` ou procedimento de serviço com autorização por empresa/unidade/papel, validação do produto, integridade dos itens, compare-and-swap do status, checagem de disponibilidade com lock, idempotency key, ajustes do ledger e saldos na mesma transação, log sem duplicidade, testes 401/403/409/500/timeout, rollback induzido, duplo clique e duas empresas A/B. Validar efeitos contábeis/fiscais separados com outbox durável; não depender de eventos Zustand em memória para garantias operacionais. Retirar bloqueios SQL **somente** após homologação em clone e plano de rollout/rollback; registrar discrepâncias históricas antes da migração. Testar se outros chamadores de `adjust_stock`/transferência são afetados antes do deploy.
