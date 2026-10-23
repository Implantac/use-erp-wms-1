# Piloto de 30 dias — roteiro operacional

Objetivo: provar o sistema na operação real (indústria + CD + lojas) e
levantar, com evidência, o que falta para a excelência. Sem dado de
mentira: o que não for usado, não entra no relatório como sucesso.

## Papéis e ritual diário (15 min por papel)
- **Loja**: abrir a Central da Loja → Fila do Dia → solicitar o que está
  abaixo do mínimo → conferir recebimentos em trânsito (integral ou
  divergência explícita). Nada fora do sistema (sem WhatsApp paralelo).
- **CD**: fila de decisão → separar/expedir pelo romaneio impresso →
  acompanhar "Operação da rede hoje".
- **Fábrica/gestor**: caixa de entrada da Fábrica (WMS) → decidir cada
  pedido (Loja × CD × Fábrica) no mesmo dia → PCP de tecelagem: Mapa de
  Teares + apontamentos reais.
- **Fiscal**: manter o cartão do emissor atualizado; emissão continua
  bloqueada até o provedor — registrar quantas vendas precisaram de nota
  (isso dimensiona a urgência do provedor).

## Semanas
- **Semana 1 — Fundamentos**: cadastros reais (empresas, unidades,
  produtos com foto/mín/máx, políticas), usuários por papel, saldos
  iniciais conferidos. Critério: painel "Pronto para operar?" sem
  pendências cadastrais.
- **Semana 2 — Fluxo de lojas**: só reposição pelo sistema. Critério: 100%
  das solicitações aparecem na Fábrica e são decididas no dia.
- **Semana 3 — Produção**: OPs de tecelagem reais no Mapa de Teares, com
  perfil (urdume/trama, rolo) e eventos apontados. Critério: produção do
  dia = apontado, sem planilha paralela.
- **Semana 4 — Consolidação**: inventário rotativo de uma unidade,
  divergências tratadas, revisão dos alertas. Critério: saldos do sistema
  batem com a contagem física na unidade piloto.

## Registro de problemas (obrigatório)
Cada problema vira linha: data, papel, tela, o que tentando fazer, o que
aconteceu, print. Revisão semanal de 30 min: corrigir o top 3. Problema
sem registro não entra na fila de correção.

## Métricas de sucesso (medidas, não estimadas)
- % solicitações de loja decididas no mesmo dia (alvo ≥ 95%);
- % recebimentos conferidos em até 24h do "em trânsito" (alvo ≥ 95%);
- Divergências por recebimento (tendência de queda);
- OPs de tecelagem com apontamento diário (alvo 100% das ativas);
- Rupturas na unidade piloto (contagem semanal na Fila do Dia).

## Saída do piloto
Relatório com as métricas + lista de correções priorizadas. Só depois:
decidir rollout para as demais unidades e a data do fiscal em produção.
