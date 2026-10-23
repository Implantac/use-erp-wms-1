# Revisão completa dos PCPs — Indústria Têxtil

**Data:** 23/10/2026 · **Escopo:** centrais de PCP de Fiação, Malharia,
Tecelagem e Tinturaria (`SectorPcpCentral`), motor comum de execução
(OP com snapshot técnico, reserva por lote, programação finita,
apontamento sequencial, qualidade e genealogia), indicadores setoriais
e acesso por setor.

**Método:** auditoria do código e das migrations (sem presumir tela =
função). Evidências citadas: `20261019110000` (motor de execução,
1.920 linhas), `20261019160000` (setor da OP derivado do roteiro),
`20261019180000` (perfis/eventos setoriais), `20261019190000`
(classificação de desvios), `20261019210000` (acesso por setor).

---

## 1. Arquitetura encontrada (o desenho está certo)

Um **único motor transacional** serve os quatro setores — snapshot de
BOM/roteiro congelado na criação da OP, reserva e consumo por lote,
capacidade finita sem dupla alocação (`schedule_production_order`),
etapas sequenciais com bloqueio de salto (`record_production_step_progress`),
conclusão com genealogia entrada→saída (`complete_production_order`) e
MRP líquido sobre saldo disponível + compras abertas. Sobre esse motor,
cada setor tem **perfil técnico, vocabulário de eventos, taxonomia de
desvios e quadro de máquinas próprios** — é PCP setorial de verdade,
não filtro de uma tela genérica.

O setor da OP nasce da **primeira operação do roteiro** do produto
(`production_steps.sector`), não de um campo digitado — decisão correta:
quem manda é o processo cadastrado.

## 2. Notas por setor

| Setor | Nota | Resumo |
|---|---|---|
| Motor comum (planejar/executar/concluir) | **8,5** | Transacional, auditável, sem atalhos; falta sequenciamento multi-restrição |
| Tecelagem | **8,3** | O mais completo + evento com tear e quadro sem subcontagem |
| Fiação | **7,0** | + composição da mistura visível a partir da BOM |
| Tinturaria | **7,4** | + banho/dosagem calculados da receita e ΔE de cor medida |
| Malharia | **6,8** | + gramatura e largura alvo no perfil |
| **Beneficiamento/Acabamento** | **3,0** | **Não existe como setor** — ver achado P1-1 |
| **PCP têxtil (conjunto)** | **7,3** | Após a elevação de nível (seção 7); beneficiamento segue como lacuna |

## 3. Achados — corrigidos nesta revisão

### C-1 (grave) — "Nova OP" das centrais não-tecelagem abria o diálogo de tecelagem
`SectorPcpCentral` renderizava `CreateTextileOrderDialog` para os
quatro setores: título fixo "Nova OP de tecelagem", campos de
urdume/trama/tear e nenhum campo dos perfis de fiação/malharia/
tinturaria. O setor final até saía certo (vem do roteiro, no banco),
mas a tela mentia e o perfil do setor só nascia depois, à mão.
**Correção:** novo `CreateSectorOrderDialog` — só oferece produtos com
BOM e roteiro ativo cuja primeira operação é do setor da central, traz
os campos do perfil daquele setor e só grava o perfil se o setor da OP
criada conferir (nunca grava perfil de um setor numa OP de outro).

### C-2 — KPI "Componentes com déficit líquido" era global, não do setor
A central contava déficits do MRP de **todas** as OPs da empresa.
**Correção:** conta só necessidades ligadas às OPs do setor
(`relatedOPs ∩ OPs do setor`).

## 4. Achados abertos (priorizados)

### P1-1 — Beneficiamento/Acabamento não é um setor
O mapa de processo conhece o estágio (`TEXTILE_STAGES.finish`), mas
não há central, perfil nem eventos de acabamento: largura final,
gramatura, rama (temperatura/velocidade), encolhimento, sanforização,
inspeção/revisão final. Hoje "Tinturaria e Acabamento" cai na
tinturaria. Na cadeia têxtil real são operações distintas, com
máquinas e responsáveis distintos. **Recomendação:** quinto setor
`beneficiamento` (perfil + eventos próprios sobre o mesmo motor),
quando o primeiro cliente com beneficiamento entrar no piloto.

### P1-2 — Tinturaria: receita não vira dosagem, cor não é medida
O perfil guarda relação de banho e metas L*a*b*, e a receita vive na
BOM/snapshot em quantidade por kg. Falta o que a tinturaria cobra no
dia a dia: dosagem por **% sobre o peso** e **g/L** derivada do banho e
do peso da partida, curva tempo×temperatura, L*a*b* **medido** e ΔE
contra a meta, e o sequenciamento claro→escuro por máquina. Nada disso
pode ser presumido — mas precisa existir o campo calculado a partir do
que a empresa configurar.

### P1-3 — Quadros de máquinas somam só os últimos 2.000 eventos
`SectorBoardPanel`/`LoomBoardPanel` agregam em memória os 2.000
eventos mais recentes da empresa. Numa OP longa (ou setor movimentado),
o "produzido" do quadro pode ficar **menor que o real**. **Correção
futura:** agregação no servidor (RPC/view por OP) em vez de limite de
janela no navegador.

### P1-4 — Evento de tecelagem não registra a máquina
`WeavingEventsPanel` não pede o tear do evento (o perfil tem, o evento
não). Resultado: "máquinas com mais parada" fica incompleto justamente
no setor mais maduro. **Correção futura:** herdar a máquina do perfil
como padrão editável no registro do evento.

### P2-1 — Fiação: mistura e título merecem estrutura
A mistura de fibras aparece só indiretamente na BOM; o título é texto
livre. Sugestão: exibir a composição % calculada da BOM no perfil e
estruturar o título (sistema + valor + tolerância) na ficha do produto.

### P2-2 — Malharia: faltam gramatura/largura e peso por rolo
`roll_change` existe, mas sem peso/comprimento do rolo nem gramatura
alvo/medida. São os três números que o gerente de malharia confere.

### P2-3 — Indicadores sem denominador de capacidade
Os indicadores setoriais são honestos (aderência, prazo, inspeções,
paradas classificadas, WIP, quebras, retingimentos) — mas não há
**eficiência** (kg/h, m/h, quebras por 1.000 fusos-hora, % de tempo
tecendo), porque falta denominador confiável (turno/calendário por
máquina). Só construir sobre apontamento real de início/fim e
calendário configurado; OEE continua fora das centrais até lá.

### P2-4 — Criação de OP de tecelagem lista todos os produtos em urdume/trama
No diálogo de criação, urdume/trama aceitam qualquer produto; no painel
da OP, só fios (correto). Unificar no filtro de fios também na criação.

### P2-5 — Acesso por setor é fail-open até a empresa configurar
Sem nenhuma concessão cadastrada, qualquer usuário da empresa abre as
quatro centrais (a escrita continua exigindo permissão de produção e,
com concessões ligadas, nível no setor). É desenho de implantação, mas
o go-live de cada empresa precisa incluir o passo "configurar
concessões" — registrar no checklist do piloto.

## 5. O que está comprovadamente sólido

- **Integridade da execução:** snapshot imutável, reserva por lote com
  idempotência, conclusão transacional com genealogia e bloqueio por
  qualidade rejeitada/quarentena.
- **Programação finita real:** conflito de recurso/máquina/centro
  detectado no banco, com trava transacional — sem dupla alocação.
- **Desvios com dono:** taxonomia por setor (6M na fiação, fio de
  urdume/trama na tecelagem, cor/receita/laboratório na tinturaria),
  causa nasce "em investigação" e só confirma com responsável.
- **Indicadores sem teatro:** sem denominador, mostram "sem dados" —
  nenhum percentual estimado em lugar nenhum das centrais.
- **Acesso granular:** viewer/operator/manager por setor, imposto nas
  RPCs de escrita (`assert_sector_access`), não só na interface.

## 6. Rota recomendada

1. **Curto (antes do piloto têxtil):** P1-3 (agregação no servidor) e
   P1-4 (máquina no evento de tecelagem) — protegem números que o
   gerente vai cobrar; P2-4 (filtro de fios na criação).
2. **Com o primeiro cliente de beneficiamento:** P1-1 (quinto setor).
3. **Com a primeira tinturaria real:** P1-2 (dosagem/ΔE a partir da
   receita configurada da empresa).
4. **Após 30 dias de apontamento:** P2-3 (eficiência com denominador
   real), P2-1/P2-2 (profundidade de fiação/malharia).

**Provas desta revisão:** typecheck limpo; 32 testes direcionados dos
módulos de PCP (perfis, indicadores, filtros de produto, acesso, MRP)
+ fumaça das rotas — verdes. Nenhuma migration nova: as duas correções
são de interface sobre RPCs existentes.

## 7. Elevação de nível aplicada (23/10/2026)

| Item da revisão | Estado |
|---|---|
| C-1 diálogo de criação por setor | ✅ corrigido (lote anterior) |
| C-2 KPI de déficit por setor | ✅ corrigido (lote anterior) |
| P1-3 quadros subcontando (2.000 eventos) | ✅ eventos paginados por completo nos dois quadros |
| P1-4 evento de tecelagem sem máquina | ✅ tear do evento (padrão = tear do perfil), alimenta paradas por máquina |
| P2-4 urdume/trama sem filtro na criação | ✅ só fios também na criação da OP de tecelagem |
| P1-2 tinturaria (banho/dosagem/ΔE) | ✅ volume do banho e totais da receita calculados da BOM+perfil; L*a*b* **medido** gravado (migration `20261023200000`) e ΔE*ab exibido contra a meta — tolerância continua sendo da empresa |
| P2-1 fiação (mistura visível) | ✅ composição % planejada da BOM no perfil da OP |
| P2-2 malharia (gramatura/largura) | ✅ gramatura alvo (g/m²) e largura alvo (cm) no perfil (mesma migration) |
| P1-1 beneficiamento como 5º setor | ⏳ próximo lote estrutural (migration + acesso + central) |
| P2-3 eficiência com denominador | ⏳ após apontamento real (calendário por máquina) |

**Provas da elevação:** migration nova aplicada na cadeia completa do
harness (**133 PASS / 0 FAIL**); typecheck limpo; **310 testes**
vitest verdes (cálculos de composição/banho/ΔE com testes próprios).
