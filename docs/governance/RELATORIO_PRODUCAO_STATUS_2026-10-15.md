# Relatório executivo — evolução da produção industrial
**Data:** 15/10/2026 · **Escopo:** plataforma de produção multi-indústria, com fábrica têxtil integrada (pluma → fio → tecido plano/malha → tinturaria/acabamento → acabado) como primeiro cenário completo.

## 1. Estado de publicação e decisão

- GitHub `Implantac/use-erp-wms-1`, `main`: `71a009c962d99780fc096e32d88bd738160a22d8`, confirmado por `git ls-remote`. Onze commits incrementais sobre `023edbd2` estão **publicados**. O push foi feito pelo usuário no Codespaces.
- Após a publicação, há **dois commits locais não publicados** neste lote: barreiras no terminal e rascunho SQL de posse de equipamento. Arquivo de transferência: `/home/user/erp-post-publish-batch.patch` (base `71a009c9`). Este relatório é o próximo incremento local; atualizar o patch após seu commit. **Não reaplicar o lote anterior de onze commits à main.**
- Não foram aplicadas migrations desta rodada, nem executados testes contra Supabase isolado. Não há comprovação de que a instância de produção reflita integralmente as migrations do repositório. **Decisão: produção industrial integral NÃO LIBERADA.**
- Os arquivos locais não commitados mostrados pelo usuário no Codespaces (`supabase/functions/mcp/index.ts`, patches e `package-lock.json`) não estão neste clone; não foram alterados nem avaliados em detalhe. Antes de novo push, preservar/revisar esses arquivos no Codespaces.

## 2. O que já foi feito — evidências e limites

| Entrega | Estado | Limite que impede aceitação integral |
|---|---|---|
| Inventário de produção têxtil (fiação, tecido plano e malha, tinturaria), matriz de lacunas e gates | Documentado em `INDUSTRIA_TEXTIL_RASTREABILIDADE_2026-10-13.md`, `PRODUCTION_GATE_2026-10-14.md` | Inspeção estática, sem piloto da cadeia pluma→acabado. |
| Indicadores industriais/BI | Painéis têxteis deixaram de mostrar números inventados; prazo BI filtra datas inválidas; PCP não soma kg/metros/unidades como «peças» | Fontes, fórmulas, turnos e dados reais não homologados. |
| PCP e programação | Prévia sem gravar; confirmação vinculada a snapshot/versão; SQL/RPC de aplicação atômica preparada no repositório, não aplicada | Concorrência, rollback e tenant no Postgres não testados; escrita pode falhar por função ausente. |
| OP e roteiros | Contenção de alterações de status com versão/empresa; conclusão direta bloqueada; proteções de roteiro/tenant e testes estáticos | Fluxo transacional completo de OP, estoque, qualidade e estorno não comprovado. |
| Equipamentos | Cadastro genérico por empresa com código/nome/tipo/setor/ativo; tear pode ser cadastrado sem presumir unidade | Capacidade usa máquina/operador em texto livre; não há posse exclusiva homologada nem integração com capacidade. |
| Terminal e apontamentos | Transições condicionadas ao estado/empresa, erros de escrita expostos, nome bloqueado durante apontamento, alertas usam empresa ativa e seleção obsoleta de máquina é rejeitada | Nome não autentica operador; alertas e pausas ainda não são transação única; OP/estoque/qualidade não são conciliados. |
| Tempo, produtividade e paradas | Métricas sem base confiável foram suprimidas; falha de alerta/pausa deixa de ser anunciada como sucesso | Início/fim e motivo estruturado de parada, tempo líquido e OEE continuam ausentes. |
| IA Executiva | Ferramenta de mutação por confirmação gerada pela IA removida; sugestão passou a ser informativa | Endpoint, demais consultas e isolamento service-role sem homologação integrada. |
| Posse de máquina — pós-publicação | Rascunho SQL em `docs/governance/sql/DRAFT_guard_machine_time_entry_ownership.sql`, fora de migrations; preflight de leitura em `scripts/sql/production-machine-preflight.sql` | Rascunho **não executado**; concorrência, SQL real, dados históricos e triggers coexistentes não homologados. |
| Validação local | Typecheck, lint CI e testes estáticos/unitários dos incrementos executados nos clones; commits publicados tiveram lint no Codespaces conforme saída enviada | Não equivalem a testes de banco, E2E fabril, carga, segurança ou aceite operacional. |

**Observação sobre a documentação histórica:** alguns documentos datados descrevem corretamente o status *na data em que foram escritos* (por exemplo, `main = 023edbd2`), mas não representam mais o estado de publicação atual. Este relatório prevalece para a fotografia de 15/10/2026.

## 3. Percentual — régua reproduzível, não promessa comercial

Não existe um percentual científico de «atender toda indústria»: processos, equipamentos, leis e integrações mudam por cliente. Para responder objetivamente, fixamos **15 frentes do plano de produção**, cada uma com quatro marcos: **(1)** incremento local verificável; **(2)** fluxo integrado com contratos/segurança; **(3)** homologação isolada com falhas/concorrência/RLS; **(4)** piloto real, aceite e operação monitorada. Um marco só conta após evidência; uma tela ou especificação isolada não completa os quatro.

| Frente (mesmo peso nesta estimativa) | Marcos comprovados / 4 | Pendência principal |
|---|---:|---|
| OP, estados e roteiro | 1 | transação completa e versões efetivas |
| PCP e sequenciamento | 1 | aplicação RPC homologada e capacidade finita |
| Cadastro e seleção de equipamentos | 1 | posse exclusiva, vínculos e capacidade |
| Apontamentos de execução | 1 | identidade, unidade, idempotência e integração |
| Isolamento de empresa na interface de produção | 1 | RLS efetiva, unidade, RBAC server-side |
| Contenção de indicadores/IA e governança | 1 | fontes reais, isolamento e aceite |
| Operador/turno autorizado | 0 | identidade operacional server-side |
| Paradas e tempo líquido | 0 | eventos início/fim/motivo transacionais |
| Unidades, conversões e capacidade por processo | 0 | contrato por item/etapa aprovado |
| Lotes, mistura, rolos e genealogia | 0 | relação entrada→saída e recall testado |
| Estoque/consumo/reservas | 0 | ledger e conciliação transacional |
| Qualidade, refugo, retrabalho e liberação | 0 | inspeção bloqueante e estorno |
| Custos reais e OEE | 0 | fórmulas e fontes auditáveis |
| Verticais fiação, tecido plano, malha, tinturaria | 0 | fluxos específicos e pilotos separados |
| QA integrado, segurança, fiscal/DF-e e release | 0 | ambiente isolado, matriz aprovada, backup/rollback |
| **Total do índice de maturidade do plano** | **6/60 = 10%** | **54/60 = 90% restantes nessa régua** |

**Leitura obrigatória do número:** 10% é **estimativa de maturidade do plano definido acima**, não porcentagem de linhas de código, do ERP inteiro, da cobertura fiscal ou de prontidão comercial. O peso igual é uma simplificação; frentes como genealogia/estoque e homologação podem consumir muito mais trabalho que cadastro de máquina. **Marcos 3 e 4 completos: 0/30 = 0%; prontidão para uma fábrica integrada: não comprovada.** A estimativa será revisada após levantamento do processo do cliente e testes em banco isolado. A existência de módulos genéricos não os transforma em etapas homologadas.

## 4. Próximos passos e condições de aceite

1. **Ambiente e preservação:** criar Supabase isolado, revisar migrations realmente aplicadas, RLS por empresa/unidade, papéis e funções SECURITY DEFINER; preservar mudanças locais do Codespaces. Não testar produção.
2. **Equipamento:** executar preflight somente em homologação, reconciliar conflitos legados com aprovação, revisar rascunho SQL por DBA, ensaiar duas sessões disputando a mesma máquina, rollback e triggers; só então propor migration aplicável.
3. **Contrato do chão de fábrica:** definir operador autorizado, turno, OP/etapa, equipamento, unidade, lote, evento de parada, motivo, início/fim e regras de quantidade com engenharia de produção.
4. **Transação de execução:** implementar API/RPC idempotente com validação de tenant/estado e atomicidade de apontamento, OP, consumo/estoque e qualidade, incluindo falha intermediária, repetição e estorno. Não reativar somas no cliente.
5. **Genealogia e verticais:** fluxo auditável da pluma ao acabado; validar separadamente fiação, tecido plano, malha e tinturaria, sem tornar seus parâmetros obrigatórios para outras indústrias.
6. **QA e liberação:** E2E real, carga, observabilidade, backups e restauração/rollback ensaiados, matriz fiscal/DF-e aprovada por empresa/contabilidade, piloto e aceite assinados. Cada evidência altera a pontuação; sem ela, a frente continua pendente.

## 5. Riscos P0 abertos

- Filtragem no frontend não substitui RLS; o estado aplicado do banco é desconhecido.
- Trigger histórico de máquina pode refletir incorretamente disputas/tenants; rascunho SQL não está ativo.
- Não há reconciliação atômica de OP, estoque e qualidade; números de produção registrados no apontamento não devem ser lidos como saldo liberado.
- Identidade livre do operador, pausa sem duração persistida, ausência de unidade por apontamento e ausência de genealogia completa impedem produtividade/OEE e rastreabilidade comprovada.
- Migrations e integrações preparadas em código podem falhar quando executadas na instância-alvo; nenhum indicador de compilação justifica implantação.
