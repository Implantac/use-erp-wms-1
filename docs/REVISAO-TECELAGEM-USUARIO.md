# Revisão da tecelagem como o gerente de PCP usa

**Data:** 28/10/2026 · **Escopo:** central de tecelagem de ponta a ponta —
origem da OP, programação, passagens, acompanhamento, cadastros
(máquinas, operadores, produtos, paradas) e geração de estoque.
**Método:** refazer o caminho do usuário na tela e no banco (harness sob
RLS), corrigir o que travava e provar de novo.

## 1. O processo simples (como ficou)

1. **Nova OP** → escolher a origem:
   - **A partir de pedido**: localizar o pedido (número ou cliente),
     selecionar o item — produto, quantidade e cliente vêm do item e a
     OP nasce **vinculada ao pedido** (gerar de novo não duplica);
   - **Avulsa (manual)**: produto de tecelagem (a lista só oferece quem
     tem BOM + roteiro começando em tecelagem), quantidade e perfil do
     tear (rolo, pente, batidas... só o que a empresa configurar).
2. **Programar** na fila por máquina da central (↑↓ reordena mantendo as
   durações; selo de atraso/conflito).
3. **Passagens**: apontar cada operação em sequência (iniciar/parcial/
   concluir) na OP selecionada; paradas e rupturas do tear no painel de
   eventos, com classificação do desvio e minutos parados.
4. **Acompanhar**: quadro de teares (OP montada por tear, metros e
   paradas), progresso da OP e prontidão de finalização.
5. **Finalizar e gerar estoque**: qualidade aprovada + quantidade e
   lotes de consumo → lote do tecido, saldo, ledger e genealogia numa
   transação só.

## 2. O que foi revisado e corrigido

| Área | Achado | Correção |
|---|---|---|
| **Origem da OP** | A tela de nova OP era 100% manual; o vínculo com pedido só existia no PCP genérico | Origem **Pedido × Avulsa** na nova OP de tecelagem: busca de pedidos confirmados, seleção do item, vínculo e idempotência por item (mesma RPC). Estendido depois a **todas** as centrais setoriais (fiação, malharia, tinturaria, beneficiamento) no diálogo comum |
| **Produtos** | A lista oferecia qualquer produto ativo — dava para "criar OP de tecelagem" de um fio e cair noutro setor | Lista restrita aos **elegíveis** (BOM + roteiro começando em tecelagem), com estado vazio explicado e links de cadastro; conta extraída para lib compartilhada com os demais setores (`eligibleProducts`, testada) |
| **Máquinas** | Setor da máquina era texto livre (grafia errada bagunçava os quadros) | Campo **Setor** virou lista canônica (Fiação…Beneficiamento) com opção "sem setor" (aparece em todas); valor antigo em texto é preservado |
| **Operadores** | Operador era digitado do zero a cada apontamento | Apontamentos (passagens e eventos do tear) **sugerem os operadores cadastrados** (Recursos → tipo Operador), sem bloquear digitar outro nome |
| **Paradas** | Já existia: eventos do tear com tipo (setup, rupturas, troca de rolo...), minutos e classificação da causa | Mantido; ganhou a sugestão de operador |
| **Programação/passagens/estoque** | Provados na rodada anterior (jornada sob RLS) | Nova prova: **OP nascida de pedido** conclui o vínculo sem duplicar no replay |

## 3. Provas

- Harness completo: **171 PASS / 0 FAIL** (2 novos: OP vinculada ao
  pedido com setor do roteiro; replay do mesmo item não duplica).
- Vitest `src/lib/pcp`: **81/81** (4 novos da elegibilidade).
- Typecheck escopado limpo nos arquivos tocados. Sem migration.

## 4. Notas honestas

- Capacidade por turno continua onde sempre esteve (Recursos/
  Capacidade); a máquina é o cadastro físico — não dupliquei conceitos.
- O apontamento do tear (metros/paradas) é manual por desenho: sem
  sensor integrado configurado, o sistema não inventa telemetria.
- Pedidos elegíveis = **confirmados/aguardando produção** (mesma regra
  do Painel PCP). Pedido ainda em aberto não aparece — confirme no
  Comercial ou crie a OP avulsa.

## 5. Ciclo seguinte — experiência do gerente

Depois desta revisão funcional, a central passou por um ciclo específico
de usabilidade: assistente de criação em três passos, bloco “Comece por
aqui”, rota visual da OP com próxima ação, mapa de teares acionável,
passagem atual destacada e paradas por botões rápidos. O detalhamento, as
provas e o roteiro de homologação com usuário real estão em
`docs/PCP-TECELAGEM-EXPERIENCIA-GERENTE.md`. A meta é a nota 10, mas ela
só deve ser declarada depois desse teste moderado com gerente/tecelão.
