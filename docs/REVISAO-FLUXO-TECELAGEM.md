# Revisão do fluxo operacional — Central PCP Tecelagem (`/vertical/weaving`)

Revisão do fluxo implementado ("do tear à conclusão") confrontado com a
prática operacional de uma tecelagem de tecido plano. Sem valores presumidos:
tempos, perdas e conversões vêm da ficha/roteiro configurados da empresa.

## 1. O fluxo como está implementado

| # | Etapa | Implementação | Onde |
|---|-------|---------------|------|
| 1 | OP criada a partir da demanda/pedido | `create_textile_production_order` | Central → Demanda Comercial / OPs |
| 2 | Snapshot da OP | `pcp_snapshot_production_order` congela BOM, roteiro e receita vigentes na emissão; OP em andamento não muda se a ficha mudar | `20261019110000`/`110000` |
| 3 | Perfil técnico de tecelagem | `weaving_order_profiles`: tear (recurso/máquina), fio de **urdume** (produto + lote), fio de **trama** (produto + lote), **rolo de urdume** (`beam_code`), **pente** (`reed_code`), **batidas/cm**, **nº de fios de urdume**, **largura planejada (cm)**, **comprimento planejado (m)**, setup (min) | `WeavingOperationsPanel` |
| 4 | Reserva por lote | `reserve_production_materials` → `production_material_reservations`; só lote com qualidade aprovada/liberada; físico/reservado/bloqueado/disponível | Painel de reserva da OP |
| 5 | Capacidade finita | `schedule_production_order` aloca janela no tear sem dupla alocação; Gantt/Timeline e OPs por centro | Aba Capacidade + Timeline |
| 6 | Apontamento sequencial | `record_production_step_progress`: etapa não inicia com etapa anterior obrigatória pendente; parcial ou total | Painel de etapas da OP |
| 7 | Eventos do tear | `record_weaving_event`: `setup`, `start`, `pause`, `resume`, `stop`, `yarn_break`, **`warp_break`**, **`weft_break`**, **`beam_change`**, `quality_hold`, `quality_release`, `inspection`, `note` — com metros (`quantity_m`), minutos de parada, motivo e operador | "Eventos e paradas do tear" |
| 8 | Qualidade | `decide_production_quality_inspection` (aprova/rejeita com ação corretiva); conclusão **bloqueada** com qualidade bloqueada ou aprovado < produzido | Inspeções da OP |
| 9 | Conclusão | `complete_production_order`: consome reservas, baixa pelo ledger único de estoque, gera lote de saída e grava **`production_lot_genealogy`** (lote de entrada → lote de saída, quantidades e referência de conversão **da ficha**, sem conversão universal presumida) | Painel de conclusão |
| 10 | Gestão | Painel do Gerente: OPs concluídas/30d, aderência, produção, saldos, lotes bloqueados, expedido — só consultas reais com drill-down | Aba Painel do Gerente |

## 2. Conferência com a prática de uma tecelagem real

**Sim — a espinha dorsal é a de uma tecelagem de verdade.** Etapa a etapa:

- **OP com snapshot** — confere. Na emissão, a OP congela a construção do
  artigo; alterar a ficha técnica depois não pode reescrever uma OP que já
  está no tear.
- **Perfil de tecelagem** — confere e usa o vocabulário certo: urdume e
  trama como insumos distintos (produto **e lote**), tear, rolo de urdume,
  pente, batidas/cm, contagem de fios de urdume, largura e metragem
  planejadas, tempo de setup. Fio de urdume e de trama têm comportamentos
  diferentes no tear — tratá-los separadamente está correto.
- **Reserva por lote** — confere e é mais rigorosa que a média do setor.
  Lote de fio determina tonalidade no tingimento posterior; reservar o lote
  exato (e só com qualidade liberada) é o que permite rastrear barramento e
  diferença de cor até a origem.
- **Capacidade finita** — confere. O tear é o gargalo clássico da
  tecelagem; programar por tear sem dupla alocação, com Gantt, é o APS
  simplificado correto. Velocidades/eficiências vêm do roteiro configurado
  (nenhuma constante universal presumida).
- **Apontamento sequencial** — confere com o fluxo físico (preparação →
  tecelagem → revisão). Produção apontada em **metros** (`quantity_m`), que
  é a unidade real de saída do tear — não em kg.
- **Eventos do tear** — confere com o apontamento de chão: quebra de urdume,
  quebra de trama, troca de rolo de urdume, paradas com motivo e duração.
  É dessa massa de eventos que sai a eficiência do tear.
- **Qualidade** — confere no essencial: nada conclui com qualidade
  bloqueada nem com aprovado menor que o produzido.
- **Genealogia** — confere e é o ponto forte: na conclusão, cada lote de
  fio consumido é ligado ao lote de tecido gerado, com quantidades e a
  referência de conversão da ficha. Responde "qual lote de fio está neste
  rolo de tecido?" — a pergunta central de qualquer reclamação de qualidade.

## 3. Ressalvas honestas (o que ainda não é uma tecelagem plena)

1. **Malharia ≠ tecelagem no fluxo de demonstração.** O fluxo executado de
   ponta a ponta na instalação local foi fiação → **malharia** (tear
   circular, malha) → tinturaria. O fluxo específico de **tecelagem plana**
   (perfil de tear, urdume/trama, eventos) está provado nos testes
   automatizados (jornada PCP 104/104, contratos 8/8, fixture 11/11 no
   Postgres de prova), mas ainda não foi executado com dados na stack do
   usuário. A infraestrutura de execução (OP, reserva, etapas, qualidade,
   conclusão, genealogia) é a mesma.
2. **Preparação simplificada.** Urdumeição e engomagem entram como etapas
   de roteiro, mas o **rolo de urdume engomado** não é um lote intermediário
   próprio: hoje `beam_code` é um código no perfil. Numa tecelagem plena, o
   rolo de urdume tem identidade de lote e entra na genealogia como elo.
3. **Ficha de construção parcial.** Faltam **ligamento** (tela/sarja/cetim/
   desenho) e **gramatura especificada × medida** como campos de
   especificação/conferência do artigo (batidas/cm, fios de urdume e
   largura já existem; o título dos fios vem do cadastro do produto).
4. **Qualidade por OP, não por rolo.** A inspeção real de tecido é por
   rolo/peça, na mesa de revisão, com mapa de defeitos e classificação
   (1ª/2ª, cortes). O sistema decide por inspeção da OP/etapa — não modela
   defeitos por rolo nem classificação comercial do tecido cru.
5. **Eficiência do tear ainda não vira indicador.** Os eventos coletam
   paradas e motivos (a matéria-prima do OEE/eficiência por tear e por
   artigo), mas ainda não há painel de eficiência consolidado.
6. **Rolo de tecido como unidade logística.** O apontamento é em metros
   por evento/etapa; o rolo individual identificado (etiqueta, metragem
   própria, vínculo com a revisão) ainda não é uma entidade separada do
   lote de saída.

## 3.1 Centrais por tipo de produção (menu Produção (PCP))

Fiação, malharia, tecelagem e tinturaria são tipos de produção diferentes e
ganharam **centrais próprias** sobre o mesmo motor de execução (sem duplicar
módulos): Central PCP Fiação (`/vertical/spinning`), Central PCP Malharia
(`/vertical/knitting`), Central PCP Tecelagem (`/vertical/weaving`) e
Central PCP Tinturaria (`/vertical/dyeing`). Cada central lista apenas as
OPs do seu setor (setor gravado na OP a partir do roteiro; centro de
trabalho só para OPs legadas sem setor) e executa o mesmo fluxo provado:
snapshot, reserva por lote, capacidade finita, apontamento sequencial,
qualidade e genealogia. Os painéis específicos do tear (perfil
urdume/trama e eventos de quebra/parada) aparecem só na central de
tecelagem. Sem OP do setor, a central avisa e mostra as demais apenas para
seleção manual, sem classificá-las nos KPIs. Rotas liberadas por
apresentação ao segmento têxtil (`verticalAccess`/`nichePresentation`) —
apresentação não concede acesso ao banco; RLS continua sendo a barreira.

## 4. Veredito

O fluxo "OP com snapshot → perfil do tear (urdume/trama) → reserva por lote
→ capacidade finita → apontamento sequencial em metros com eventos de
quebra/parada → qualidade com bloqueio → conclusão com genealogia" **é o
fluxo que se faz numa tecelagem**, na ordem certa e com as travas certas
(nada pula etapa, nada conclui sem qualidade, nada consome lote bloqueado).
As lacunas são de profundidade têxtil (preparação com lote de rolo de
urdume, ligamento/gramatura na ficha, revisão por rolo com defeitos,
eficiência por tear, rolo como unidade logística) — evolução incremental
sobre a base atual, sem retrabalho do que está provado.
