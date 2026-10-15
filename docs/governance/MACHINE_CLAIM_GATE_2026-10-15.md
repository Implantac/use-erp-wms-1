# Gate de posse de equipamento no apontamento — 15/10/2026

Base publicada: `71a009c9`. Incrementos posteriores são locais; **não houve push nem migration executada**. O trigger histórico `sync_machine_status_from_time_entry` atualizava o estado da máquina ao inserir/alterar apontamentos sem verificar se a máquina era da mesma empresa ou já estava ocupada por outro apontamento. O filtro da interface não resolve disputa entre sessões.

Foi preparado o rascunho SQL `docs/governance/sql/DRAFT_guard_machine_time_entry_ownership.sql`, **fora de `supabase/migrations` para impedir aplicação automática**, que substitui a função do trigger existente: bloqueia a linha da máquina, valida empresa da máquina/OP e equipamento ativo, recusa outro apontamento iniciado/pausado na mesma máquina, impede mudança posterior de máquina/empresa do apontamento e não reabre um apontamento concluído. A exceção do trigger deve reverter a escrita do apontamento na mesma transação. O rascunho aborta se detectar conflitos ativos conhecidos em vez de apagá-los. `scripts/sql/production-machine-preflight.sql` é uma consulta somente leitura para executar **na homologação isolada**, antes da migration. Resolver inconsistências apenas com procedimento aprovado e auditável.

## Bloqueios de liberação

- Não há instância Supabase isolada disponível aqui; não foram confirmados SQL efetivo, ordem das migrations já aplicadas, privilégios do owner, triggers coexistentes, RLS multiempresa/unidade, lock em concorrência real ou rollback no banco. Testes estáticos não provam esses comportamentos.
- A função existente também alimenta eventos via outro trigger; verificar em homologação a interação e a sequência, inclusive inserts, atualizações de status e alterações não relacionadas a status.
- Uma máquina com apontamento legado iniciado/pausado não deve ser tomada por outro operador; conflitos históricos exigem decisão humana. A migration não migra histórico, não corrige status antigos automaticamente e não implementa cadastro/autorização do operador, motivos/duração de parada nem estoque/qualidade/OP transacionais.
- Antes de transformar o rascunho em migration e executar: preflight sem ocorrências, backup, plano de reversão, teste com duas empresas e dois usuários, tentativas simultâneas no mesmo equipamento, equipamento inativo, OP de outra empresa, falha/repetição de request e revisão por DBA/engenharia de chão de fábrica. Somente então aprovação explícita para aplicar em homologação; produção permanece **não liberada**.

Verificações locais: `node --test scripts/test-machine-claim-migration.mjs`, `npm run typecheck`, `npm run lint:ci`, `git diff --check`. Nenhum teste local substitui a execução real do PostgreSQL.
