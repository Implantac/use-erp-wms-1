# Revisão — PCP por setor têxtil (fiação, malharia, tecelagem, tinturaria)

Numa indústria têxtil real, cada tipo de produção tem PCP próprio porque o
processo é diferente: recurso gargalo, unidade de produção, perfil técnico,
eventos de chão, qualidade e indicadores mudam de setor para setor — e, em
geral, há um responsável de PCP por setor. Esta revisão confronta essa
realidade com o sistema e registra o que foi implementado para cada central
ser um PCP de verdade, e não uma visão filtrada do mesmo formulário.

## 1. O que cada PCP gerencia na prática

| Dimensão | Fiação | Malharia | Tecelagem | Tinturaria |
|---|---|---|---|---|
| Entrada típica | Fibra/pluma em lotes | Fio em lotes | Fio de urdume + fio de trama | Malha/tecido cru em lotes |
| Recurso gargalo | Filatório | Tear circular | Tear plano (+ preparação) | Máquina de tingir (JET/barca) |
| Unidade de produção | kg de fio (por título) | kg de malha | **metros** de tecido | kg/partida tingida |
| Perfil técnico da OP | Título alvo, torção, máquina | Galga, diâmetro, máquina | Urdume/trama (produto+lote), rolo de urdume, pente, batidas/cm, fios de urdume, largura, metragem, setup | Cor/código, partida, relação de banho configurada, máquina, meta CIELAB (quando aplicável) |
| Receita/ficha | Mistura via BOM | Fio via BOM | Construção via BOM/roteiro | Receita química via ficha/snapshot (nunca dosagem presumida) |
| Eventos de chão | Tirada, ruptura de fio, paradas | Quebra de fio, troca de rolo, paradas | Quebra de urdume/trama, troca de rolo de urdume, paradas | Banho, lavagem, descarga, retenção p/ acerto de cor, retingimento |
| Qualidade | Título/regularidade (inspeção) | Defeitos de malha (inspeção) | Revisão do cru (inspeção) | Cor aprovada/ΔE, retingimento (inspeção) |
| Saída | Lote de fio | Lote de malha crua | Rolo/lote de tecido cru | Lote tingido |

## 2. Estado após esta revisão

**Motor único, PCP por setor** (sem duplicar módulos):

- Quatro centrais no menu Produção (PCP): Fiação (`/vertical/spinning`),
  Malharia (`/vertical/knitting`), Tecelagem (`/vertical/weaving`) e
  Tinturaria (`/vertical/dyeing`). Cada uma lista apenas as OPs do seu
  setor e executa o mesmo fluxo transacional provado: OP com snapshot,
  reserva por lote, capacidade finita, apontamento sequencial, qualidade
  com bloqueio e conclusão com genealogia.
- **Perfil técnico próprio por setor** (migration `20261019180000`):
  `spinning_order_profiles` (título alvo, torção, máquina, kg planejado),
  `knitting_order_profiles` (galga, diâmetro, máquina, kg planejado) e
  `dyeing_order_profiles` (máquina, cor/código, relação de banho
  configurada, partida, metas L*a*b* quando aplicável, kg planejado). A
  tecelagem mantém `weaving_order_profiles`. Escrita só via RPC
  (`upsert_sector_order_profile`) com as guardas de empresa/OP das demais
  funções `pcp_*`; leitura por RLS da própria empresa.
- **Eventos próprios por setor** (`sector_production_events` +
  `record_sector_event`): o vocabulário é validado por setor nos dois
  lados (TS e SQL) — evento de tinturaria é rejeitado na fiação e
  vice-versa; eventos do tear continuam na tabela da tecelagem.
- KPIs da central escopados ao setor (OPs ativas/concluídas do setor e
  janelas finitas das OPs do setor); sem OP do setor, a central avisa e não
  classifica OPs de outro setor nos indicadores.

## 3. Provas

- Replay completo no Postgres embarcado: **460/460 migrations** (baseline +
  patches + migrations + `99-local-final`), seed da BIL e seed do fluxo.
- **SETOR VERIFY: 23/23** — OPs novas de fiação/malharia/tinturaria criadas
  pelas RPCs oficiais; perfis salvos/atualizados e persistidos (título e
  torção; galga e diâmetro; cor, relação de banho e CIELAB); eventos
  próprios registrados e eventos de outro setor rejeitados (`22023`);
  máquina de outra empresa/inexistente rejeitada (`42501`); perfil em OP
  concluída bloqueado (`55000`); CIELAB fora da faixa rejeitado (CHECK).
- Front: vitest 59/59 (incl. contrato TS↔SQL dos vocabulários),
  `typecheck:weaving` OK, ESLint sem erros.

## 4. O que ainda separa cada central de um PCP setorial pleno

1. **Responsável por setor (governança).** Hoje qualquer usuário com
   acesso ao PCP opera qualquer central. O desenho prevê permissão por
   setor (ex.: `production.pcp` escopado a fiação/tecelagem/tinturaria)
   para o gerente de cada setor ver e operar só o seu — depende de decisão
   de perfis de acesso da empresa; não implementado.
2. **Indicadores setoriais profundos.** Eficiência por máquina (a partir
   dos eventos de parada já coletados), kg por título na fiação, metros e
   paradas por tear, % de cor aprovada de primeira e retingimento na
   tinturaria — matéria-prima existe; os painéis ainda não consolidam.
3. **Planejamento setorial avançado.** Balanceamento de seções na fiação,
   agrupamento por artigo/rolo de urdume na tecelagem e sequenciamento por
   família de cor na tinturaria (reduzir lavagens entre partidas) são
   políticas de programação por setor a evoluir sobre a capacidade finita
   atual, sempre com parâmetros configurados — nada presumido.
4. **Execução com dados na stack do usuário.** Os perfis/eventos de setor
   estão provados no harness; na instalação local, o fluxo de
   fiação/malharia/tinturaria já rodou com dados (`PREPARAR-FLUXO-TESTE`)
   e a tecelagem plana ganhou teste guiado próprio
   (`PREPARAR-TECELAGEM.bat`, provado no harness: SETOR+TECELAGEM 36/36 —
   OP com perfil do tear, reserva urdume/trama, 5 eventos, 480 m em
   estoque, genealogia com 2 arestas, idempotente). Falta o usuário rodar
   o teste de tecelagem na stack dele e navegar nas quatro centrais.

## Correção pós-homologação — seletores operacionais filtrados

Na homologação, o campo "Fio de urdume" listava todos os produtos ativos
(pluma, corante, malha). Correção aplicada:

- **Urdume/trama só listam fios** (`src/lib/pcp/productFilters.ts`): produto
  é fio quando a categoria/subcategoria indica fio ou o código/nome começa
  por "Fio". O produto já salvo continua visível para não travar edição.
- **Máquina/recurso só do setor** nos painéis de perfil e eventos de todos
  os setores: item com setor têxtil de outro setor é excluído; item **sem
  setor cadastrado não é escondido** (esconder travaria cadastros antigos) —
  para a lista ficar estrita, basta informar o setor de cada máquina no
  cadastro de máquinas.
- Seeds passam a nascer com o setor da máquina (FIL-01=Fiação,
  CIRC-01=Malharia, JET-01=Tinturaria, TEAR-01=Tecelagem).

Validação: vitest do PCP (com `productFilters.test.ts`), `typecheck:weaving`
e harness embarcado persistente (`/home/user/pgtest-harness`) com replay das
460 migrations + seeds + asserções de tecelagem — 13/13 PASS.
