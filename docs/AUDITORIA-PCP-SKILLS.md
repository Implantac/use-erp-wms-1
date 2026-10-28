# Auditoria do PCP contra as skills setoriais (fiação, tecelagem/malharia, tinturaria)

Documentos de referência recebidos em 2026-10-21: `PCP_Fiacao_Prompt_Skill.md`,
`PCP_Tecelagem_Prompt_Skill.md` e `PCP_Tinturaria_Prompt_Skill.md`. As skills são
especificações de comportamento de PCP (não inventar dados; separar planejado,
apontado, aprovado, reprovado e retrabalhado; indicadores com fórmula
documentada; classificação de desvios; dados mínimos antes de programar;
testes de aceite por setor). Esta auditoria cruza cada exigência com o estado
real do sistema e registra o que foi melhorado neste lote.

## O que as skills exigem × estado

| Exigência das skills | Estado | Evidência / observação |
| --- | --- | --- |
| Não inventar receita, dosagem, rendimento, capacidade | Atendido por desenho | Nenhum parâmetro é sugerido pela tela; dosagens/receitas só existem como cadastro aprovado da empresa. Indicador sem denominador mostra "sem dados". |
| Separar planejado × apontado × aprovado × rejeitado × retrabalhado | Atendido | Status de OP, inspeções com decisão formal, eventos `re_dye` contam retrabalho na tinturaria. |
| Perfis técnicos e eventos próprios por processo (não misturar rotas) | Atendido | Perfis e vocabulários por setor (migration `20261019180000`); tecelagem plana com tabelas/RPCs próprias; malharia sem urdimento/engomagem. |
| Apontamento mínimo: máquina, quantidade, parada (min), motivo, operador | Atendido | Eventos setoriais e de tecelagem com esses campos desde a origem. |
| **Classificação de desvio por setor + causa em investigação/confirmada** | **Implementado neste lote** | Migration `20261019190000`: `deviation_category`/`cause_status` nas duas tabelas de eventos, validação por setor nas RPCs, seletores nos painéis e selo no histórico. Taxonomias: fiação/malharia (6M + energia/programação), tecelagem (fio de urdume/trama, tear, preparação...), tinturaria (cor, substrato, receita, produto químico, laboratório...). |
| **Indicadores com fórmula documentada por setor** | **Implementado neste lote** | `src/lib/pcp/sectorIndicators.ts` + cartão "Indicadores do setor" em cada central: aderência ao plano, cumprimento de prazo, inspeções aprovadas, paradas por classificação e por máquina, rupturas, WIP e retingimento. Fórmulas no cabeçalho do módulo; sem dado = "sem dados". |
| **Dados mínimos antes de programar (perguntas obrigatórias)** | **Implementado neste lote (presença de cadastro)** | Bloco "Prontidão mínima para programar" na central: máquinas identificadas com o setor e insumo-chave classificado (fibra, fios ou corantes) existem ou a tela diz o que falta cadastrar. Não supõe capacidade. |
| Capacidade finita sem dupla alocação; gargalo visível | Atendido / parcial | Janelas finitas por recurso com detecção de conflito; "máquinas com mais parada" expõe gargalo operacional. Sequenciamento automático por cor/setup continua **pendente** (política da empresa). |
| Rastreabilidade lote de fibra/fio → lote de tecido → expedição | Atendido | Genealogia persistida entrada→saída, reservas por lote, expedição WMS por lote. |
| Qualidade: bloquear reprovado; retrabalho só com decisão | Atendido | Inspeções com decisão formal bloqueiam a conclusão; retingimento é evento registrado, não atalho. |
| Não reservar lote bloqueado; ordem sem ficha/rota aprovada | Atendido e provado | OP nasce de roteiro versionado com snapshot congelado. Teste negativo N1 do harness: reservar lote com qualidade bloqueada é rejeitado pelo banco; N2: concluir sem inspeção aprovada é rejeitado; N3: conflito de tear é rejeitado. Cadeia integrada dos 4 setores executada de ponta a ponta — ver `docs/TESTE-FLUXO-SETORES.md` (27/27 PASS). |
| OEE, kg/h, m/h por máquina, consumo de utilidades | Pendente (dado insuficiente) | Exigem horas operadas/paradas por máquina e medição de utilidades. Hoje há minutos de parada apontados; OEE sem telemetria seria estimativa — as skills proíbem. Fica para quando houver apontamento de horas por turno ou integração real. |
| Dosagem automática a partir de receita | Fora de escopo deliberado | As skills proíbem dosar sem receita aprovada e base cadastrada. O sistema registra receita/perfil; o cálculo de dosagem só entra com o cadastro de receitas aprovadas da BIL. |
| Permissões por gerente de setor | Pendente (próximo lote) | Skills §ERP pedem "permissões por função". Hoje o acesso é por módulo; a segregação por setor é o próximo item da fila. |

## Validação deste lote

- Vitest do PCP (indicadores, prontidão, classificadores, taxonomias): PASS.
- `typecheck:weaving` e ESLint dos arquivos tocados: PASS.
- Harness embarcado persistente (`/home/user/pgtest-harness`): replay das
  **461 migrations** + seeds BIL/fluxo/tecelagem + asserções de negócio,
  incluindo gravar evento classificado e rejeitar categoria de outro setor
  nas RPCs reais — **17/17 PASS**.
