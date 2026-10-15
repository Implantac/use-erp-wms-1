# Incremento: cadastro de equipamentos de produção — 15/10/2026

Escopo local, não publicado: rota `/producao/maquinas` na navegação de produção condicionada ao contexto industrial já existente. Permite listar, cadastrar e editar código, nome, tipo livre, setor e ativo de `production_machines` da empresa selecionada. Um tear pode ser cadastrado como equipamento do tipo escolhido pelo cliente, assim como máquina de fiação ou tinturaria. Nenhuma unidade de capacidade é presumida. A tela não altera o estado operacional. Leituras, realtime e gravações no hook são delimitados por empresa; atualização usa a versão `updated_at` lida, condicionada ao retorno do banco. Falhas de consulta não são apresentadas como cadastro vazio.

## Lacunas e bloqueios

- Operador no terminal ainda é nome livre/localStorage, não cadastro ou identidade validada. Capacidade por turno ainda usa máquina/operador em texto livre, sem FK com este cadastro; não associar por similaridade de nomes.
- Apontamento existente aceita início/pausa/retomada/fim e quantidades, mas não acumula corretamente a duração pausada. Tempo líquido, produtividade e OEE não estão comprovados. Rótulos em peças não servem indiscriminadamente para kg ou metros.
- Reportar problema gera alerta e pausa, não parada estruturada com motivo, início/fim, duração e equipamento; falta verificação de erro em parte desse fluxo.
- Painéis de fiação, tecelagem e têxtil informam indicadores não mensurados; não há painel específico de tinturaria nem receita/banho/liberação homologados.
- Alterações do hook são proteção no cliente, **não substituem RLS multiempresa no banco**. Não houve homologação Supabase isolada, teste de concorrência real nem piloto de operação. Sem migrations aplicadas, push ou liberação para produção.

## Verificação local

`node --test scripts/test-production-machine-registry.mjs`; `npm run typecheck`; `npm run lint:ci`; `git diff --check`. Testes estáticos e compilação não comprovam permissão/RLS, operação de máquina, paradas ou cálculo industrial real. Próxima etapa: definir unidade por OP/etapa, vínculo de operador autorizado e evento de parada transacional com início/fim antes de declarar eficiência.
