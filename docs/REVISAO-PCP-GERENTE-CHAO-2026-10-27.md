# Revisão dos PCPs têxteis — na cadeira do gerente de chão de fábrica

**Data:** 27/10/2026 · **Escopo:** programar fiação, malharia, tecelagem e
tinturaria no dia a dia (beneficiamento acompanha o mesmo motor).
**Método:** usei cada central como o gerente usaria (criar OP → programar →
sequenciar → acompanhar), confrontei com o que os sistemas de referência do
segmento entregam e evoluí o ponto de maior dor sem reconstruir nada.

---

## 1. O que o mercado entrega (e o gerente espera)

- **Systêxtil** — PPCP com "programação de lotes, sequenciamento de
  operações, gestão de capacidade e recursos"; o painel de scheduling
  sinaliza em **vermelho a ordem que não será entregue a tempo** e em verde
  a que está no prazo/concluída [1](https://systextil.com.br/funcionalidades/)
  [5](https://portalerp.com/br/noticia/scheduling-assertivo-com-o-painel-de-planejamento-de-producao-do-systextil).
- **Consistem** — na tecelagem, o gestor "define prioridades e a ordenação
  da produção por tear", otimizando setup e aproveitamento da capacidade
  [2](https://blog.consistem.com.br/industria-textil-como-controlar-fios-lotes-e-rendimento/).
- **LermenSys** — tinturaria com "gestão visual da programação das máquinas
  e do sequenciamento das Ordens de Tingimento" em Kanban, exibindo a
  sequência em que as ordens devem andar
  [4](https://lermensys.com.br/solucoes-erp/).
- **Sisplan** — PPCP com visão de capacidade e **simulação de cenários**
  antes de firmar a programação; tinturaria com ordens, baixas por
  rolos/taras, qualidade, desperdícios e **custo por cor e grupo**
  [1](https://sisplansistemas.com.br/pt/solucoes/erp-sisplan)
  [4](https://sisplan.com.br/tinturaria/).

Padrão do segmento: **programar é sequenciar por máquina com prazo à
vista**, e cada setor tem sua regra econômica (tear = setup/artigo;
tinturaria = cor/lavagem; fiação = título; malharia = galga/diâmetro).

## 2. A dor que encontrei aqui (por setor)

O motor de execução é forte (OP com snapshot, reserva por lote, capacidade
finita validada no banco, apontamento, qualidade com bloqueio, genealogia).
A dor estava na **programação**, igual nos quatro setores:

1. **Programar exigia sair da central do setor** para a tela genérica
   "Programação finita" — a central mostrava a OP de hoje, mas não a fila.
2. **Não existia fila por máquina em nenhum setor**: qual OP entra em cada
   filatório/tear circular/tear/JET, em que ordem e quando termina —
   invisível. O quadro de máquinas mostra só a OP montada agora.
3. **Sem semáforo na central**: conflito de janela e atraso existiam como
   cálculo (`detectScheduleConflicts`), mas só apareciam no Painel do
   Gerente (empresa inteira), não na tela de quem programa o setor.
4. **Tinturaria sem economia de cor**: nenhuma ajuda para ordenar as
   partidas claro→escuro; cada clareamento fora de ordem é uma lavagem de
   cuba (JET parado) que o gerente tinha que evitar de cabeça — justamente
   o recurso que o LermenSys vende como Kanban de sequenciamento.
5. **OP escolhida por lista suspensa** na central: com dezenas de OPs,
   achar a OP certa para conferir era o caminho mais lento da tela.

## 3. O que foi evoluído neste lote

**Quadro "Programação do setor — fila por máquina" dentro de cada central**
(fiação, malharia, tecelagem, tinturaria e beneficiamento), sem sair da
tela do setor:

- **Fila por máquina/recurso**: posição, OP (clique abre a OP na central),
  janela início→fim, quanto falta produzir, prazo de entrega; selos
  **Atrasada** (vermelho), **Conflito** (janela sobreposta no mesmo
  recurso) e **Em execução**.
- **Re-sequenciar com ↑↓**: recalcula as janelas empilhando a fila
  **mantendo as durações que o próprio PCP planejou** (nenhum tempo
  inventado); OP já iniciada é âncora e não se move. Por baixo, usa o
  caminho oficial (cancelar + `schedule_production_order`), que continua
  rejeitando dupla alocação e janela menor que o tempo estimado da OP.
- **"Sem programação" acionável**: OPs do setor sem janela, ordenadas por
  prioridade e prazo, com máquina + início + duração (pré-preenchida pelo
  tempo estimado da OP, quando existe) e botão **Programar** na linha.
- **Tinturaria — economia de cor**: cada OP mostra cor e L* (CIELAB do
  perfil da OP); a fila denuncia **"clareamento(s) na sequência — lavagem
  extra provável"** e o botão **"Ordenar por cor (claro→escuro)"**
  re-sequencia as partidas pela L*; OPs sem L* ficam agrupadas por nome de
  cor e sinalizadas para conferência manual. Nada de tempo de lavagem
  presumido: a regra é direcional (claro→escuro), como o chão trabalha.
- **Governança respeitada**: quem é só `viewer` do setor vê a fila sem
  botões; programar/re-sequenciar exige `operator`+ (mesma regra do banco).

**Provas:** lógica pura em `src/lib/pcp/sectorProgramming.ts` com testes
(fila com atraso/conflito, re-sequenciamento preservando durações e
âncoras, sequência por cor) — **vitest src/lib/pcp: 73/73**; typecheck
escopado limpo nos arquivos tocados. Nenhuma migration: o banco já tinha
tudo (janelas finitas, perfis com CIELAB, máquinas).

## 4. Roteiro de evolução (próximos lotes, por valor)

1. **Regras de setup por setor sobre a mesma fila**: tecelagem agrupar por
   artigo/rolo de urdume; malharia por galga/diâmetro; fiação balancear kg
   por título entre filatórios — sugestões como a da cor, sempre com
   parâmetro configurado.
2. **Semáforo de entrega por OP** (a la Systêxtil): cruzar prazo da OP com
   o fim projetado da fila e pintar quem **não entrega** — hoje o atraso é
   sobre a janela; falta projetar a fila inteira contra o `due_date`.
3. **Calendário de turnos no empilhamento**: re-sequenciar respeitando
   `production_capacity` (h/dia por recurso já cadastradas) em vez de
   relógio corrido, e simulação de cenário (mover OP entre máquinas) antes
   de firmar — o passo do Sisplan.
4. **Eficiência por máquina consolidada** a partir dos eventos de parada já
   apontados (OEE setorial), e custo por cor/grupo na tinturaria a partir
   das fichas configuradas (nunca dosagem presumida).
5. **Arrastar e soltar** na fila (hoje ↑↓) e visão semana/mês da fila.

## 5. Limites honestos desta entrega

- Durações das janelas são as que o gerente informa/estima na OP — o
  sistema não presume velocidade de máquina nem tempo de lavagem.
- O re-sequenciamento é cancelar+recriar janelas (a RPC oficial não move
  janela ativa); se uma recriação falhar no meio, a OP aparece em "Sem
  programação" com aviso — nada some em silêncio.
- A sequência por cor usa L* do perfil da OP; sem L*, agrupa por nome da
  cor. Tempo de lavagem por troca de família química só entra quando a
  empresa configurar a ficha — por desenho, não presumimos receita.
