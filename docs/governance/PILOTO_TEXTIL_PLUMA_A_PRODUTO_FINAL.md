# Piloto integrado: pluma → tecido plano / malha → acabamento

Estado: **especificação e preparação, NÃO operacional nem homologado**. Cenário confirmado: os dois caminhos, fábrica integrada, sem banco Supabase isolado disponível. Nenhuma receita, parâmetro químico, conversão de unidade, tolerância, custo ou benefício fiscal é pré-configurado sem dados aprovados pelo cliente. O perfil é metadado de planejamento, não autorização.

## Fluxos independentes com origem comum

| Ordem | Entrada → saída (identidade preservada) | Tecido plano | Malha | Persistência existente / lacuna P0 |
|---|---|---|---|---|
| 1 | Lote recebido de pluma → lote de fibra preparada | recepção, classificação, mistura, abertura/limpeza | mesmo | `products`, `stock_movements` (ledger existente), `production_orders`; falta vínculo imutável entrada→saída, pesagem, qualidade e transação de consumo |
| 2 | Fibra → lote de fio identificado (título/composição) | cardagem, passadoria, maçaroqueira, filatório, bobinagem conforme planta | mesmo | `production_routes`, `production_route_steps`, `production_order_steps`; falta OP com versão, perdas e genealogia por lote |
| 3A | Fio → rolo de tecido cru | preparação de urdume, urdimento/engomagem quando aplicável, montagem, tecelagem | não aplicável | cadastro de etapas/recursos existe; faltam consumo por urdume/trama, rolo e controle de metragem |
| 3B | Fio → rolo de malha crua | não aplicável | malharia, rolo de malha e inspeção | etapa `knitting` incluída no **planejamento**; faltam máquinas/agulhas e consumo real por rolo |
| 4 | Cru identificado → lote/rolo beneficiado | preparação, tingimento/estamparia conforme processo real | idem, podendo exigir parâmetros diferentes | `production_quality_checks`/`quality_inspections` existem; faltam receita versionada, banho/lote, parâmetros e bloqueio de qualidade |
| 5 | Beneficiado → rolo/lote acabado | secagem, rama/acabamento, inspeção e classificação | idem | faltam medição final, encolhimento/largura/gramatura configuráveis e segregação de reprovados |
| 6 | Acabado aprovado → pedido/expedição | separação por lote e unidade | idem | reutilizar `stock_movements` e fluxo comercial/fiscal existente; falta reserva, disponibilidade por lote e prova E2E |

Não há indicação de que **todas** essas operações se apliquem a cada cliente. A definição de centros, receitas, características e tolerâncias exige levantamento na fábrica. Rolo, batelada e lote podem ter hierarquias distintas; não usar uma string única como genealogia completa.

## Contrato mínimo antes de executar uma OP real

1. Produto e unidade de medida aprovados; conversão kg↔m↔rolo só com evidência e regra por artigo/lote. BOM/rota/receita com revisão publicada e cópia imutável referenciada pela OP; proibir alteração retroativa sem nova revisão.
2. Empresa autorizada no backend e RLS A/B provada; recurso, produto, insumo, etapas, roteiro, lote e depósito da mesma empresa. Estoque de entrada disponível **por lote e local**, considerando reservas, sem assumir saldo bruto global.
3. Em uma transação de banco: idempotência por evento, reserva/baixa do ledger **existente**, apontamento de operação, perdas/rejeitos, geração de lote(s) de saída e ligações quantitativas de genealogia. Proibir repetição, consumo negativo e saída sem entrada identificada; concorrência deve ser ensaiada.
4. Checkpoints de qualidade por etapa parametrizados por cliente: bloqueio de reprovado/pendente, decisão de retrabalho com nova OP e trilha de aprovação. Não preencher aprovação padrão.
5. Fechamento somente após reconciliação quantidade entrada = aprovada + rejeitada + perdas justificadas (com unidade consistente) e comprovação de movimentações persistidas. Trigger de entrada automática de acabado e bloqueio de conclusão devem ser testados juntos antes de qualquer liberação.

## Sequência de entregas e provas

- **P0-A** Banco isolado: inventário de schema/triggers/policies; executar preflights somente leitura dos roteiros, OPs, RLS A/B e ledger; nunca produção como ambiente de ensaio.
- **P0-B** Ledger e genealogia: modelo de eventos idempotentes no ledger atual, ligações quantitativas entre lotes e ensaio de rollback/concorrência, tanto para 3A quanto 3B.
- **P0-C** Engenharia: versões imutáveis de BOM, rota e receita; unidade/conversão e escolha explícita do caminho por artigo; impedir mutação de revisão usada.
- **P0-D** Execução e qualidade: OP transacional de pluma até fio, depois 3A e 3B separadamente; controles de tinturaria/acabamento e segregação de lotes; somente então reabilitar geração/conclusão.
- **P0-E** E2E persistido: cliente A e B, fluxo completo de cada ramo; tentativas duplicadas/concurrentes, falhas na metade, reprovação e retrabalho, estoque e expedição; reconciliar ledger sem custo inventado. Critério de aceite: IDs reais de entradas/saídas e versões, efeitos persistidos e invariantes conferidos após rollback.

Até essas provas, dashboards e etapas configuradas não significam que a planta esteja pronta para uso. O pedido de fiscal depende de inventário de DF-e e regras reais do cliente; não presumir tributação de venda ou remessa.
