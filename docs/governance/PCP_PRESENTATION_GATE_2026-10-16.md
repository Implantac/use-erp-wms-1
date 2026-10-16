# PCP operacional — gate para apresentação têxtil integrada (16/10/2026)

**Solicitação:** operação real nos próximos dias, mostrando fábrica integrada têxtil. **Condição atual:** sem Supabase isolado e sem dados de demonstração aprovados. Portanto, **não declarar PCP concluído operacionalmente**. `main` publicada permanece `71a009c9`; as alterações pós-publicação e este incremento são locais, sem push/migrations aplicadas.

## Incremento local: agendamento

A tela `ProductionSchedule` antes buscava todas as linhas sem `company_id`, criava agendamento sem verificar OP/empresa/retorno, fechava o diálogo mesmo em erro e atualizava qualquer ID sem empresa/versão. Agora o hook delimita leitura e escrita pela empresa ativa; valida intervalo e OP ativa da empresa; verifica agendamento existente como feedback preliminar (não unicidade transacional); exige linha retornada em insert/update; e usa comparação de status/`updated_at` para início/encerramento da **janela de programação**. Falha de leitura é explícita e não mostra zeros como ausência real. Encerrar janela não conclui OP. Nenhuma capacidade física é reservada.

### Aceite operacional mínimo — ainda pendente

| Cenário | Evidência exigida na homologação isolada |
| --- | --- |
| Empresa A/B e unidades | leitura/escrita negadas fora da empresa/unidade; RLS e roles do banco efetivos |
| Pedido → OP | somente dados/versões aprovados; idempotência por item; erro no último item faz rollback integral |
| Roteiro, máquina, recurso, materiais | versões e unidades compatíveis; nenhum equipamento atribuído simultaneamente; capacidade real configurada |
| Programação | aplicar prévia íntegra da RPC `apply_pcp_preview`; alterar OP concorrente antes de confirmar deve rejeitar sem escrita parcial |
| Agendamento | duas sessões tentando a mesma OP; restrição/lock no servidor, não apenas verificação da interface |
| Execução/qualidade/estoque | evento do operador autorizado, parada mensurável e conclusão/estorno de OP transacionais, sem números inventados |
| Fiação → tecido plano/malha → tinturaria | genealogia de lotes/cones/rolos/banhos, unidades e receita aprovadas pela fábrica |
| Release | logs, rollback, backup/restauração, fixtures validadas e aceite escrito de engenharia/QA |

**P0 adicional descoberto:** a lista de agendamentos no hook genérico não tinha filtro por empresa. O incremento melhora a contenção no cliente, mas **não é prova de RLS**. A checagem de duplicata antes de inserir é sujeita a corrida; não afirmar unicidade sem constraint/lock verificados no banco. `production_schedule.company_id` é nullable no tipo gerado; agendamentos legados sem empresa serão omitidos da listagem, não atribuídos automaticamente. Isso requer preflight em homologação, sem correção automática de dados reais.

Verificações locais: `node --test scripts/test-production-schedule-tenant.mjs`, `npm run typecheck`, `npm run lint:ci`, `git diff --check`. Testes estáticos e compilação **não** substituem transações/RLS testadas no PostgreSQL. Dados fictícios só depois de parâmetros aprovados; não inventar valores fiscais, capacidade, ritmo ou turnos do cliente.
