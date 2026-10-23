# Teste do fluxo operacional entre as quatro centrais de PCP

Data: 2026-10-21 · Ambiente: replay completo no Postgres embarcado
(`/home/user/pgtest-harness`), pelas RPCs oficiais, sem dado por fora.

## A pergunta

O menu com **Central PCP Fiação, Malharia, Tecelagem e Tinturaria** está
correto para uma empresa real?

**Sim — é assim que uma indústria têxtil integrada se organiza.** Cada
processo tem física, máquina, unidade e supervisor próprios (filatório não
é tear; JET não é conicaleira). O que integra os setores não é uma tela
única: é a **demanda/MRP** e os **estoques intermediários por lote** — o fio
que a fiação entrega vira insumo da tecelagem/malharia; a malha crua vira
insumo da tinturaria. O sistema espelha isso: a OP nasce na central do
setor do seu roteiro, e a passagem entre setores acontece por lote
reservado/consumido com genealogia persistida.

Ressalva para a BIL: o cadastro dela é **tecelagem + tinturaria**. As
centrais de fiação e malharia existem e funcionam, mas numa BIL real elas
ficariam sem OPs enquanto o fio for comprado — fio comprado entra como
produto/lote de estoque e alimenta a tecelagem do mesmo jeito. As centrais
"a mais" não atrapalham; ficam prontas para o dia em que houver produção
própria de fio/malha.

## O teste executado (cadeia integrada, uma OP por setor)

| Setor | OP | Entrada → Saída | Resultado |
| --- | --- | --- | --- |
| Fiação | 200 kg de fio 30/1 | 236 kg de pluma | **195 kg** de fio, lote FIO-INT-LOTE-001; perfil título Ne 30/1, torção 780 t/m |
| Tecelagem | 400 m de tecido plano | 86 kg do fio acima | **385 m** de tecido cru, lote TECIDO-INT-LOTE-001; rolo ROLO-INT-001 |
| Malharia | 100 kg de malha crua | 103 kg do mesmo fio | **97 kg**, lote MALHA-INT-LOTE-001; finura E28, Ø 76,2 cm |
| Tinturaria | 97 kg tingidos | 97 kg de malha + 2,425 kg de corante | **95 kg** Azul Royal, lote MALHA-INT-TING-LOTE-001; banho 1:8, Lab 35/5/−38 |

Saldos após a cadeia (conferidos no banco): pluma 24 kg · fio 6 kg ·
malha crua 0 kg · corante 7,575 kg · tecido 385 m · malha tingida 95 kg.
Genealogia entre setores: fio←pluma, tecido←fio, malha←fio,
tingida←malha+corante (5 arestas). Cada OP caiu na sua central (setor vem
do roteiro) e concluiu com qualidade aprovada.

## Testes negativos (o que NÃO pode acontecer numa fábrica)

| # | Tentativa indevida | Resultado |
| --- | --- | --- |
| N1 | Reservar lote **bloqueado** pela qualidade | **Rejeitado** pelo banco |
| N2 | Concluir OP **sem inspeção aprovada** | **Rejeitado** pelo banco |
| N3 | Dois OPs no **mesmo tear, janela sobreposta** | **Rejeitado** (capacidade finita) |
| N4 | Registrar evento de **fiação na tinturaria** (e categoria de desvio de outro setor) | **Rejeitado** pela RPC |

## Resultado

Harness completo: replay das **461 migrations** + seeds (BIL, fluxo,
tecelagem, integração) + 27 asserções — **27/27 PASS**.

## Como reproduzir na sua máquina

`PREPARAR-INTEGRACAO.bat` (depois do pacote atualizado): cria a mesma
cadeia na BIL e cada central passa a mostrar uma OP concluída, o cartão de
indicadores com números reais e os eventos classificados. Idempotente.

## Limites honestos (não fingimos)

- Indicadores de eficiência finos (OEE, kg/h por máquina) dependem de
  apontamento contínuo de horas/paradas — com o uso real, os cartões
  ganham denominador; hoje mostram o que há, sem estimar.
- Sequenciamento automático (agrupar por cor, minimizar setup) continua
  decisão do programador; o sistema impede o conflito, não escolhe a
  ordem por ele.
- Permissão por gerente de setor é o próximo lote.

## Adendo 2026-10-21 — catálogo por processo e fluxo comercial

Duas frentes pedidas pelo usuário foram executadas e provadas no mesmo
harness (**33/33 PASS**):

1. **Catálogo por processo** (`PREPARAR-PEDIDOS.bat` aplica
   `seed-catalogo-processos.sql`): categorias **Fibras e Plumas, Fios,
   Tecidos Planos, Malhas, Corantes e Auxiliares, Serviços de
   Beneficiamento**, produtos reais de cada processo já classificados
   (fio 20/1, 30/1 penteado, poliéster texturizado, mescla; sarja,
   popeline; piquet, meia-malha; corante preto, amaciante, detergente de
   purga) e os produtos dos testes anteriores recategorizados. É a
   categoria que alimenta os filtros: **urdume/trama só listam Fios**.
   Corrigida também a consulta de categorias (são globais; o filtro por
   empresa fazia o mapa vir vazio e o seletor cair no improviso).
2. **Pedido → produção → entrega** (`seed-pedidos-clientes.sql`):
   PV-INT-001 tecido 300 m (R$ 8.400), PV-INT-002 fio 5 kg, PV-INT-003
   malha tingida 80 kg — expedidos pelo WMS com baixa do lote certo
   (tecido ficou 85 m; fio, 1 kg) — e **PV-INT-004, tinturaria para
   terceiro**: a malha do cliente (lote MALHA-TERC-LOTE-001, origem
   "terceiro") gera OP na Central de Tinturaria **vinculada ao pedido**,
   é tingida e devolvida expedida ao mesmo cliente. Genealogia do
   material do cliente preservada (2 arestas).
