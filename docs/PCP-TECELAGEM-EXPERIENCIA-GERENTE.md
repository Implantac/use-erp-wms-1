# PCP de Tecelagem — experiência do gerente

**Data:** 28/10/2026
**Objetivo:** permitir que o gerente de tecelagem responda, em segundos, a quatro perguntas: **o que precisa da minha decisão, em qual tear está, qual OP devo abrir e qual é a próxima ação**.

## Princípios adotados

1. **Uma próxima ação por vez.** A central não deve obrigar o gerente a interpretar todos os painéis para descobrir o que fazer.
2. **Linguagem do chão de fábrica.** “Em produção”, “aguardando material”, “pronto até”, “passagem atual” e “gerar estoque” substituem códigos e jargões na leitura principal.
3. **Revelação progressiva.** Primeiro a demanda; depois a preparação do tear; detalhes técnicos complementares ficam recolhidos.
4. **Clicar leva ao contexto.** Mapa de teares, fila de decisões e rota da OP abrem a OP no painel certo — sem obrigar o gerente a procurar a seção.
5. **Nenhum parâmetro inventado.** O assistente não sugere batidas, fios, largura, setup ou duração que não estejam cadastrados/configurados.
6. **Erro antes do envio.** Quantidade inválida, passagem vazia e pré-requisito de finalização são explicados antes de chamar o banco.

## Como ficou a jornada

### 1. Começar o dia

No topo da Central de Tecelagem, o bloco **“Comece por aqui — decisões da tecelagem”** mostra somente cartões derivados de dados reais:

- entrega vencida;
- conflito no tear;
- fila atrasada;
- OP fora da fila para programar;
- OP em produção para acompanhar;
- quando está tudo sob controle, a próxima OP da fila.

Cada cartão abre a OP representativa e rola para programação ou para o trabalho na OP.

### 2. Criar a OP

A nova OP virou um assistente de três passos:

1. **O que tecer** — atender um pedido ou produzir avulsa; artigo, quantidade, prioridade, prazo e cliente.
2. **Preparar o tear** — tear, rolo de urdume, fios e comprimento quando já conhecidos; detalhes técnicos complementares ficam recolhidos e podem ser feitos depois.
3. **Confirmar** — resumo em linguagem simples e a rota que será seguida depois da criação.

Ao concluir, a mensagem diz qual é o próximo passo: programar a OP na fila do tear. O formulário é limpo para a próxima criação.

### 3. Programar

A área passa a se chamar **“Programação dos teares — fila por tear”**. As OPs prontas aparecem como **“Prontas para entrar no tear”**, ordenadas por prioridade e prazo, com ação **“Programar no tear”**.

O mapa de teares:

- diferencia tear **tecendo**, **livre** e **em manutenção/indisponível**;
- mostra metros reais apontados e o último registro em linguagem de tecelagem;
- quando o comprimento planejado não foi informado, não exibe um falso 0%: diz exatamente o que falta;
- tem **“Abrir esta OP”**, que seleciona a OP e leva ao trabalho nela.

### 4. Trabalhar na OP

A OP selecionada ganhou a **“Rota desta OP — do tear ao estoque”**, com cinco etapas clicáveis:

1. Programar no tear;
2. Conferir fios e lotes;
3. Tecer e apontar;
4. Liberar a qualidade;
5. Gerar estoque.

A etapa atual ou bloqueada aparece destacada, com o botão **“Fazer agora”**. Também há atalhos para **montagem do tear**, **paradas e rupturas** e **fila dos teares**.

A montagem do tear foi reorganizada na ordem real de trabalho:

1. montar o tear;
2. separar fios e lotes;
3. conferir os parâmetros do artigo.

### 5. Apontar passagens e paradas

Nas passagens, somente a **passagem atual** recebe campos e botões. As concluídas aparecem fechadas e as futuras dizem que aguardam a anterior. Os botões mudam conforme o estado: **Iniciar/Retomar**, **Apontar parcial**, **Pausar** e **Concluir passagem**.

Nas paradas, os eventos frequentes viraram botões rápidos: início, pausa, retomada, ruptura de urdume, ruptura de trama, troca de rolo e parada. A classificação da causa ficou como detalhe opcional, podendo ser feita depois.

### 6. Finalizar

O botão de finalização não parece mais disponível quando falta pré-requisito. Ele mostra **“Concluir os pré-requisitos acima”** e a tela aponta o primeiro item faltante. Quando passagens, qualidade e ficha estão liberadas, o botão volta a ser **“Concluir OP e registrar entrada em estoque”**.

## Arquivos principais

- `src/lib/pcp/weavingManagerGuide.ts` — decisões do gerente e rota da OP, como lógica pura testável.
- `src/modules/production/productionOrders/WeavingManagerCockpit.tsx` — “Comece por aqui”.
- `src/modules/production/productionOrders/WeavingJourneyGuide.tsx` — rota visual e próxima ação da OP.
- `src/modules/production/productionOrders/CreateTextileOrderDialog.tsx` — assistente de criação em três passos.
- `src/modules/production/productionOrders/LoomBoardPanel.tsx` — mapa de teares acionável.
- `src/modules/production/productionOrders/WeavingOperationsPanel.tsx` — montagem do tear e paradas simplificadas.

## Provas deste ciclo

- Vitest do PCP e apresentação das OPs: **91/91**.
- Typecheck escopado: limpo nos arquivos tocados; permanecem apenas erros pré-existentes de outros arquivos do grafo.
- Sem migration e sem alteração de RPC/motor: a mudança é de experiência e orientação, preservando as travas já provadas.

## O que ainda impede declarar “nota 10”

Nota 10 não se declara por inspeção de código. Faltam:

1. **Teste moderado com gerente e tecelão reais**, usando o roteiro abaixo, medindo conclusão, erros e tempo.
2. **Homologação no dispositivo real do chão de fábrica** (computador, tablet ou celular que a empresa usar), especialmente toque, leitura à distância e velocidade dos apontamentos.
3. Reduzir ainda mais a dispersão dos cadastros avançados, sem duplicar telas nem conceitos.
4. Avaliar, com dados de uso, se valem atalhos físicos por tear (por exemplo, código impresso/QR) — isso deve nascer de necessidade observada, não de adivinhação.

## Roteiro de homologação com usuário real

Peça ao gerente, sem explicar os cliques antes:

1. Criar uma OP a partir de um pedido confirmado.
2. Criar uma OP avulsa.
3. Programar uma OP em um tear livre.
4. Abrir uma OP pelo mapa de teares.
5. Registrar ruptura de urdume com minutos parados.
6. Apontar e concluir uma passagem.
7. Descobrir por que uma OP ainda não pode gerar estoque.
8. Finalizar uma OP pronta e encontrar o lote gerado.

Critério para avançar rumo ao 10: o usuário conclui sem ajuda, não procura telas fora da central, não interpreta código interno e consegue dizer, ao final de cada tarefa, qual é o próximo passo.
