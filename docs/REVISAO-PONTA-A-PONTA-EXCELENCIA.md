# Revisão de ponta a ponta — o que falta para atender com excelência
## uma indústria que produz fios, malha e tecidos

Data: 2026-10-21 · Método: inventário do código, telas, migrations e das
provas executadas (harness SQL 33/33, jornadas e homologações locais).
Estados: **Provado** (executado e conferido), **Implementado** (existe,
sem prova de uso real), **Parcial** (atende parte), **Falta**.

## Veredito executivo

O **núcleo produtivo está pronto e provado**: PCP por setor (fiação,
malharia, tecelagem, tinturaria), OP com ficha congelada, reserva por
lote liberado, capacidade finita, qualidade com bloqueio formal,
genealogia entre setores, indicadores honestos e o ciclo pedido →
produção → expedição por lote — tudo executado de ponta a ponta.

O que separa o sistema de **atender com excelência** uma indústria real
não é mais o PCP: é o **entorno** — fiscal brasileiro homologado, custos
industriais, laboratório de cor, manutenção, permissões por setor,
unidade em rolos e a prova em uso real com dados da empresa. Abaixo, por
domínio, com prioridade: **P0** = impede operar/excelência hoje;
**P1** = excelência operacional; **P2** = diferencial competitivo.

## Matriz por domínio

| Domínio | Estado | O que falta |
| --- | --- | --- |
| PCP e execução por setor | **Provado** | Sequenciamento assistido (P1); urdimento/engomagem como operações próprias (P1) |
| Comercial e pedidos | Implementado | Prova E2E do caminho de ouro (teste está `fixme`); tabela de preços por cliente/artigo e grade de cores (P1) |
| Expedição/WMS por lote | **Provado** | Conferência/romaneio por volume e etiqueta de rolo (P0/P1) |
| Estoque e lotes | **Provado** (produção) | Rolo/peça como unidade individual (P0); inventário cíclico provado (P1) |
| Qualidade | Parcial | Planos de inspeção/amostragem e fluxo NC→ação corretiva (P1) |
| Laboratório de cor | Parcial | ΔE calculado contra padrão e aprovação formal de lab dip (P1) |
| Manutenção | **Falta** | OS preventiva/corretiva, plano por máquina, MTBF (P1) |
| Custos industriais | **Falta** | Custo por lote/OP/metro e margem por pedido (P0) |
| Fiscal (NF-e e cia.) | **Bloqueado** | Emissão homologada e remessa/retorno de beneficiamento (P0) |
| Financeiro | Implementado | Prova ponta a ponta: pedido→faturamento→recebimento (P0/P1) |
| Compras e MRP | **Provado** (geração) | Recebimento com inspeção de entrada amarrado (P1) |
| Facção/terceiros | Parcial | Enviar fio/malha para terceiro e receber de volta (P1); receber para tingir está provado |
| Pessoas e turnos | **Falta** | Escala/equipe e apontamento de horas por turno (P1; habilita OEE) |
| Permissões e segurança | Parcial | Permissão por gerente de setor (P0); prova RLS A/B executada (P0) |
| Indicadores e relatórios | Parcial | Relatórios têxteis exportáveis e visão de diretoria com dados reais (P1) |
| IoT e integrações de chão | **Falta** (por desenho) | Telemetria real de teares, balança, espectrofotômetro (P2) |
| Operação e continuidade | Implementado | Teste de restauração de backup e rotina fora da máquina (P0) |

## P0 — o que impede a excelência hoje

1. **Fiscal brasileiro homologado.** As telas existem (NF-e, CT-e, MDF-e,
   certificados), mas a emissão responde 503 e nunca foi validada com a
   SEFAZ. Sem isso a indústria não fatura. Para beneficiamento de
   terceiros (o PV-INT-004 que hoje funciona operacionalmente) faltam as
   notas de **remessa/retorno de industrialização** e o controle fiscal
   do **saldo de material de terceiros**. É integração com provedor/
   SEFAZ + contador validando CFOP por operação.
2. **Permissões por gerente de setor.** Hoje quem tem acesso à produção
   enxerga todos os setores. Numa fábrica real, o gerente de tinturaria
   não aprova OP de fiação. Falta a segregação por setor no backend
   (RPC/RLS), não só no menu.
3. **Custos industriais.** O consumo de matéria-prima por lote é real,
   mas não há custo de conversão (mão de obra, energia, depreciação),
   custo por metro/kg produzido nem margem por pedido. Sem custo, não há
   preço nem excelência — há chute.
4. **Rolo/peça como unidade.** Tecido e malha hoje são "lote com total
   de metros/kg". Fábrica vende **rolos individuais**: metragem por rolo,
   defeitos mapeados por rolo, etiqueta, romaneio. É a lacuna nº 1 da
   revisão de tecelagem e precisa de entidade própria ligada ao lote.
5. **Prova em uso real.** Tudo foi provado com dados de teste. Excelência
   exige **um ciclo real completo na BIL** (pedido real → entrega →
   faturamento → recebimento), carga dos cadastros reais assistida,
   treinamento dos operadores e o checklist formal de aceite assinado.
6. **Segurança e continuidade provadas:** executar o ensaio RLS A/B em
   banco (o runner existe e nunca rodou), testar a restauração do backup
   e guardar cópia fora da máquina.

## P1 — excelência operacional

- **Laboratório de cor de verdade:** alvo Lab por cor/cliente, ΔE
  calculado entre padrão e banho, tolerância por cliente, fluxo de
  aprovação de lab dip antes da produção (hoje o Lab é só registro no
  perfil e a retenção de cor é evento).
- **Qualidade estruturada:** planos de inspeção com amostragem,
  defeitos classificados por tipo/pontos, não-conformidade com causa
  raiz, ação corretiva e reinspeção (hoje há inspeção e decisão; o fluxo
  de NC é parcial).
- **Manutenção:** ordens de serviço, plano preventivo por máquina,
  histórico, MTBF e parada planejada alimentando a capacidade (hoje a
  máquina só tem status).
- **Horas por turno e equipe:** operador hoje é texto livre. Com escala
  e horas apontadas, os indicadores ganham denominador real: eficiência
  por tear, kg/h, OEE honesto.
- **Urdimento e engomagem** como operações planejáveis com capacidade
  própria (hoje vivem como etapa/perfil do tear).
- **Sequenciamento assistido:** sugerir ordem por prazo, cor (claro→
  escuro), setup e disponibilidade de urdume — sempre como sugestão ao
  programador, nunca automática.
- **Facção outbound:** remeter fio para terceiro tecer/tingir, controlar
  saldo em poder de terceiros e receber o beneficiado (o caminho inverso,
  receber para tingir, está provado).
- **Comercial B2B têxtil:** tabela de preço por cliente/artigo, grade de
  cores por pedido, limite de crédito com prova, e relatórios de
  produção/perdas/custo exportáveis por período e máquina.

## P2 — diferencial (só depois do P0/P1)

- Telemetria real (contadores de tear/filatório, sensores), integração
  com balança e espectrofotômetro; portal do cliente para acompanhar
  pedido e beneficiamento; EDI com grandes clientes; leitura de código
  de barras/RFID na expedição por rolo.

## Roteiro sugerido (ordem, sem promessa de data)

1. **Fechar o P0 interno** (permissões por setor, custos v1 por lote/OP,
   rolo/peça, ensaio RLS e restore de backup) — é código nosso.
2. **Fiscal com provedor + contador** — depende de terceiro; começar já
   pela homologação SEFAZ em paralelo.
3. **Piloto real na BIL** com cadastros reais e um ciclo completo,
   treinando quem opera; o que o piloto quebrar vira correção antes de
   qualquer P1.
4. **P1 em lotes** (laboratório/ΔE, NC, manutenção, turnos/horas,
   sequenciamento assistido), cada um com prova no harness.
5. **P2** apenas com demanda real de cliente.

## O que NÃO falta (não gastar energia)

Loja virtual, checkout e PIX/boleto de varejo estão bloqueados por
desenho e **não fazem falta** a uma indústria B2B de fios/malha/tecido;
o mesmo vale para módulos verticais não têxteis do catálogo genérico.
Excelência aqui é profundidade no têxtil, não largura de catálogo.
