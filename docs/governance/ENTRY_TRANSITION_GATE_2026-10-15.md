# Gate de apontamento: transições e conciliação — 15/10/2026

Incremento local, não publicado: as telas Terminal e Apontamentos só consideram bem-sucedidas pausa, retomada e conclusão quando a atualização do registro retorna uma linha e seu estado anterior corresponde ao esperado (`started`/`paused`), sempre delimitada à empresa. A criação deve ter sucesso antes de tentar avançar a OP. Conclusão repetida sobre um apontamento já concluído não deve alterar o registro novamente. Isso é proteção por condição SQL emitida pelo cliente, **não é autorização server-side**.

Foi removida das duas telas a tentativa de adicionar diretamente produção/refugo à OP: `useProductionOrders.update` já impede atualizações de quantidades; reaplicar essa soma separadamente poderia gerar divergência e duplicidade. A quantidade permanece no apontamento; a OP/estoque/qualidade **não são conciliados automaticamente**. KPIs globais de quantidades sem unidade foram removidos da tela Apontamentos. Não migrar dados retroativamente por esse incremento.

Pendente: RPC transacional idempotente para validar identidade, unidade e capacidade, lançar evento, conciliar OP, estoque e qualidade, com lock/controle de concorrência; pausa com início/fim persistidos; RLS comprovada por empresa/unidade; homologação isolada e cenários de carga. Transição de estado de OP após criar apontamento ainda é outra escrita, sem atomicidade. Rótulos e outros agregadores do projeto devem ser auditados individualmente. Produção **não liberada**.

Verificações locais: `node --test scripts/test-production-entry-transition-guard.mjs`, `npm run typecheck`, `npm run lint:ci`, `git diff --check`. Testes estáticos não verificam RLS ou corrida real no banco.
