# Fluxo do PCP por setor — como funciona e por que "não andava"

**Data:** 27/10/2026 · **Escopo:** telas de programação, passagens
(apontamento das operações), finalização do setor e geração de estoque
nas centrais de fiação, malharia, tecelagem, tinturaria e beneficiamento.

## 1. O fluxo, passo a passo (como o gerente faz)

1. **Abrir a central do setor na empresa da indústria.** O PCP é por
   empresa (OP, estoque e cadastros moram nela). Gestor de grupo precisa
   estar com a empresa da indústria ativa — a troca oficial de empresa
   (menu da empresa) atualiza o contexto no servidor junto.
2. **Criar a OP** ("Nova OP de …"): só entram produtos com **BOM** e
   **roteiro ativo cuja 1ª operação é do setor** — o setor da OP nasce do
   roteiro, o snapshot técnico congela e as etapas são geradas.
3. **Programar**: no quadro "Programação do setor — fila por máquina",
   OPs sem janela ganham máquina + início + duração; a fila aceita
   re-sequenciar (↑↓) e, na tinturaria, ordenar por cor (claro→escuro).
4. **Apontar as passagens**: na OP selecionada, painel "Apontamento
   sequencial das operações" — Iniciar / Apontar parcial / Pausar /
   Concluir etapa, em ordem (a etapa seguinte só recebe meta do que a
   anterior concluiu de bom). Reservar os lotes antes acelera o fim,
   mas a alocação obrigatória acontece na conclusão.
5. **Qualidade**: registrar a inspeção com a quantidade aprovada e
   **Aprovar**. Sem aprovação formal ≥ quantidade produzida, o banco
   recusa a conclusão (é o que impede "concluir no escuro").
6. **Finalizar o setor e gerar estoque**: painel "Finalizar OP e
   registrar entrada em estoque" — quantidade boa/rejeitada, lote de
   entrada de cada componente e (opcional) o número do lote de saída.
   Numa transação só: baixa os lotes consumidos, cria o lote do produto
   do setor, credita o **saldo**, grava consumo no ledger oficial
   (`production_consumption`/`production`), a genealogia lote→lote e
   fecha as reservas. O lote gerado já pode ser consumido pela OP do
   **próximo setor** (fio da fiação → malharia, etc.).

## 2. Diagnóstico (com prova, sem achismo)

Adicionei ao harness a **"Jornada do PCP como o app faz"**: o fluxo
inteiro refeito sob `SET ROLE authenticated` (RLS ligada, como o
PostgREST enxerga), incluindo a passagem fiação→malharia consumindo o
lote que a fiação gerou. Resultado: **169 PASS / 0 FAIL** — programar,
passagens, qualidade, finalizar, saldo gerado e ledger estão corretos
no banco.

Então por que não estava operacional para o usuário? Duas travas de
operação, não de motor:

- **Empresa errada sem aviso.** O PCP é single-company, mas o gestor do
  grupo vive na holding (onde não há um produto sequer). As telas do
  abastecimento funcionam em escopo de grupo, então ninguém aprende a
  trocar; na central do setor, o sintoma era lista vazia + erros crus.
- **Cadastro-base sem caminho.** Sem operação classificada no setor,
  BOM, roteiro começando no setor, máquina do setor ou lote liberado
  com saldo, cada passo recusava com um toast — e nenhuma tela dizia
  *o que* faltava nem *onde* cadastrar.

## 3. O que mudou neste lote (sem migration)

- **Guia de prontidão do setor** no topo de cada central
  (`SectorSetupGuide` + lib pura `sectorReadiness` com testes): lê os
  mesmos cadastros que as RPCs validam e lista o elo faltante com o
  botão do cadastro (Operações, Fichas/BOM, Roteiros, Máquinas, Lotes).
  Some sozinho quando o setor está pronto. Se a empresa ativa **não tem
  nenhum produto**, o guia diz que o problema é a empresa e oferece
  **trocar para a empresa da indústria** com um clique (troca oficial,
  com contexto no servidor).
- **Diálogo de nova OP**: o aviso de "nenhum produto elegível" ganhou
  os botões diretos para Fichas/BOM, Roteiros e Operações.
- Correção colateral: o campo **gramatura alvo** do perfil de
  beneficiamento era usado sem existir no estado do formulário
  (quebrava o typecheck e o campo não segurava o valor) — criado.

## 4. Checklist da primeira vez numa empresa nova

1. Operações do setor com o setor classificado (`/producao/etapas`)
2. Produto do setor com BOM (`/producao/fichas`)
3. Roteiro ativo começando numa operação do setor (`/producao/roteiros`)
4. Máquinas do setor ativas (`/producao/maquinas`)
5. Entrada do insumo gerando lote liberado + saldo (`/wms/lotes`)

Com os 5, o ciclo inteiro roda na central sem sair dela.
