# Produção configurável por empresa: contrato e limites

Estado: **planejamento incremental, não habilitação operacional**. A solicitação abrange fiação, tecelagem, tinturaria, lavanderia, confecção, ração, alimentos, químicos/limpeza e outros processos de transformação. Não existe certificação universal de «100% de todas as indústrias». Cada cliente precisa mapear processos, normas aplicáveis, documentos, unidades, tolerâncias, equipamento, aprovação e cenário fiscal antes de liberar operação. A configuração em `companies.settings.industrial` não autoriza módulos nem substitui RLS.

## Núcleo único, extensões por processo

| Capacidade transversal | Fonte atual | Prova obrigatória antes de liberar |
|---|---|---|
| Produto, unidade e lote | `products`, ledger `stock_movements` | unicidade por empresa, conversões válidas, saldo por lote/local, identificação entrada→saída |
| Estrutura/receita e roteiro | `production_bom`, `production_routes`, `production_route_steps` | versões imutáveis e aprovadas; não editar revisão usada, rastrear substituições |
| OP, operação e recurso | `production_orders`, `production_order_steps`, centros/recursos existentes | transação única por evento, tempos/quantidades reais, idempotência, autorização A/B |
| Material e produto intermediário | ledger existente, sem ledger novo | reserva e consumo por lote, saídas intermediárias, perdas/retrabalho, rollback concorrente |
| Qualidade e expedição | `quality_inspections`, comercial/WMS existentes | checkpoint bloqueante, trilha de decisão, liberação por lote e documento fiscal real |

O catálogo `INDUSTRIAL_PROCESS_FAMILIES` é múltiplo por empresa e retrocompatível com os quatro perfis têxteis; `INDUSTRIAL_FAMILY_DISCOVERY` exibe perguntas de levantamento **não homologadas**. Nunca transformar switch do navegador em permissão ou receita fiscal. Famílias não cadastradas usam `general_manufacturing` após levantamento, não uma regra genérica permissiva.

| Família | Diferença operacional a levantar (exemplo, não valor padrão) | Pendente |
|---|---|---|
| Fiação/tecelagem/malharia | pluma→fio→urdume/trama ou rolo de malha; kg/m/rolo e testes próprios | genealogia quantitativa e ambos E2E |
| Tinturaria/lavanderia/acabamento | banho/carga, receita, parâmetros medidos, efluentes/qualidade | revisão e aprovação por lote, normas/licenças específicas |
| Confecção | grade, tamanho, molde, corte/costura, facção quando aplicável | versão e lote até peça, reprocesso e fiscal |
| Ração animal | ingredientes, fórmula, mistura, análises, validade | regulamentos e controles aplicáveis ao cliente, sem assumir licença |
| Alimentos | receita, validade, condições de processo, rastreabilidade e recall | controles sanitários aplicáveis, segregação e liberação |
| Químicos/limpeza | formulação, perigos, condições, rotulagem e destino | requisitos de segurança/ambientais e documentação específicos |
| Outra transformação | processo, unidade, perdas, medição e qualidade | contrato de produção e critérios por cliente |

## Aceite individual

Para cada empresa: inventário de DF-e e regras fiscais **reais**, base limpa, operações mapeadas e roteiro configurado; RLS A/B; migrações aplicadas e auditadas em Supabase **isolado**; testes E2E persistidos de compra/recepção→OP→consumo→qualidade→estoque→expedição, inclusive falha, concorrência e reprovação; conferência do ledger/lotação e aprovação do responsável. Até isso, status é **não comprovado**. Não ativar produção por mera seleção de perfil ou compilação.

## Apresentação por ramo escolhido na contratação (incremento local)

O onboarding passou a oferecer ramos mais específicos (têxtil, fiação, tecelagem, tinturaria, lavanderia, confecção, ração, alimentos, químicos/limpeza, além dos legados), mantendo aliases antigos. A função `canPresentNicheRoute` é usada tanto na construção do menu (inclusive pesquisa/atalhos) quanto na guarda de URLs `/producao` e `/vertical`: perfis não industriais não veem PCP; vertical de outro ramo não aparece e acesso direto é barrado na interface. Empresa não configurada falha fechada para essas rotas. O ramo principal é distinto das famílias de processos múltiplos em `companies.settings.industrial`.

**Cobertura atual deliberadamente parcial:** esta política cobre apenas rotas `/producao` e `/vertical`, não classifica todas as telas compartilhadas, WMS/fiscal ou pacotes por funcionalidade. Tinturaria, lavanderia e químicos não têm dashboard vertical dedicado comprovado; o cadastro não fabrica uma tela operacional para eles. Nenhum ajuste de menu autoriza APIs, RLS, OPs ou faturamento. Antes de dizer «somente telas inerentes» é necessário inventariar cada rota/filho, dependências e permissões por empresa/unidade/usuário, aplicar o mesmo contrato na API e provar A/B em banco isolado. Uma empresa integrada precisa poder configurar várias famílias sem liberar automaticamente processos não homologados.
