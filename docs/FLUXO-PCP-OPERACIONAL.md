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

## 5. Recebimento da pluma/fibra (lote T81/P0, 28/10/2026)

A entrada da matéria-prima da fiação agora fecha o elo lote → saldo:

1. Em **WMS → Recebimento** (ou **WMS → Lotes**), use **“Receber
   pluma/fibra”** e informe produto em kg, fornecedor, lote do fornecedor,
   peso que entrará no estoque, documento/NF-e e endereço.
2. Na mesma tela, registre somente a classificação realmente informada:
   fardos, pesos bruto/líquido, umidade, micronaire, comprimento,
   resistência, impurezas, cor/grade e classe. Campo vazio continua vazio —
   o sistema não estima laudo.
3. A RPC `register_fiber_receipt` cria o **lote pendente de qualidade** e
   um único movimento oficial em `stock_movements` com o `lot_id`; o saldo
   em `stock_balances` nasce pelo trigger do ledger, vinculado ao mesmo
   lote. Repetir o mesmo envio com a mesma chave é idempotente; reutilizar
   o número do lote em outro recebimento é recusado.
4. A conferência WMS (`finalize_receiving_conference`) também passou a
   criar/vincular o lote conferido e a lançar o movimento com `lot_id`.
5. Em **Controle de Qualidade**, aprove, coloque em quarentena ou rejeite o
   lote. Só depois da aprovação o PCP consegue reservar a pluma para a OP
   de fiação. Lotes recebidos pela conferência podem receber a classificação
   depois, pelo botão **Classificar** em WMS → Lotes.

Prova automatizada: o harness de banco cobre recebimento direto,
classificação, correção da classificação, idempotência, rejeição de lote
duplicado, aprovação de qualidade e conferência WMS com saldo por lote.

## 6. Rolos/peças e embalagem (lote T81/P0, 28/10/2026)

Depois que a conclusão da OP gera o lote de saída:

1. Em **WMS → Lotes**, abra **Rolos/peças** no lote produzido e registre
   cada unidade física: código/etiqueta, tipo (rolo, peça, fardo ou
   pacote), quantidade, comprimento, largura, peso e localização — só o
   que foi medido/informado.
2. A soma dos rolos/peças nunca pode passar da quantidade física do lote.
   A unidade **não cria saldo novo**: o saldo continua sendo o do lote em
   `stock_balances`.
3. No mesmo painel, inspecione cada rolo/peça (aprovar, quarentena ou
   rejeitar, com motivo e defeitos quando aplicável). A decisão fica
   registrada por unidade.
4. Em **Packing & Conferência**, os rolos/peças aprovados e disponíveis
   aparecem para embalar. Só unidade aprovada pode virar “Embalado”; a
   embalagem não altera quantidade nem saldo.

Resultado atualizado desta rodada: harness de banco **181 PASS / 0 FAIL**
neste ponto (187 ao final, com os modelos de roteiro e a engomagem);
vitest PCP+têxtil+WMS+produção **107/107** ao final do lote.

## 7. Modelos de roteiro e preparação do urdume (lote T81/P1, 28/10/2026)

Em **Produção → Rotas Produtivas → Aplicar modelo têxtil**, a empresa
aplica ao produto um dos modelos canônicos:

- **Fiação completa**: Abertura → Limpeza → Cardagem → Preparação/Passador
  → Maçaroqueira → Filatório → Bobinagem/Conicagem.
- **Fiação direta**: mesma cadeia sem a maçaroqueira, para a empresa que
  trabalha com essa variante.
- **Tecelagem com/sem engomagem**: Urdideira → (Engomagem) → Preparação
  dos teares → Tecelagem plana.
- **Malharia circular**, **Preparação e tinturaria** (inspeção do cru →
  preparação → pré-tratamento → tingimento → lavagem) e **Acabamento**
  com variante **Rama** ou **Compactação** (acabamento final → secagem →
  rama/compactação → inspeção final → embalagem).

Aplicar o modelo cria/reutiliza as operações da empresa, cria o roteiro
ativo do produto e passa a ser o roteiro dele. Tempos, máquinas, receitas
e parâmetros nascem não informados/zerados para a empresa configurar —
nada é presumido. Repetir a aplicação com a mesma chave é idempotente.

Na OP de tecelagem, a montagem do tear ganhou a seção **Preparar urdume e
engomagem**: estado da preparação, urdideira/recurso, se a engomagem é
aplicável e, quando for, produto/lote de goma ou código/receita aprovada,
concentração, temperaturas, velocidade e umidade informados. Marcar
“engomado” sem engomagem aplicável é recusado pelo banco.

Resultado atualizado: harness de banco **187 PASS / 0 FAIL**.

## 8. Expedição por rolo, receita versionada e parâmetros setoriais (lote T82, 28/10/2026)

**Expedição por rolo/peça.** Em **WMS → Separação e Expedição → Rolos**,
vincule ao pedido os rolos/peças **embalados e aprovados** dos lotes já
reservados — a soma por lote nunca passa da quantidade reservada. Ao
**Separar**, a alocação do rolo vira “separado” junto com a reserva; ao
**Expedir**, alocação e unidade viram “expedido” na mesma operação.
Pedido sem rolos vinculados continua expedindo por lote, como antes: o
saldo continua sendo o do lote e nenhum ledger novo foi criado.

**Receita de engomagem versionada.** Na montagem do tear, **Gerenciar
receitas** cadastra as receitas da empresa como rascunho (código, nome,
produto de goma, ingredientes e parâmetros — só os informados). Aprovar
uma nova versão substitui a aprovada anterior do mesmo código, e a OP só
pode usar **versão aprovada**: ao salvar, o servidor copia concentração,
temperaturas, velocidade e umidade daquela versão para o perfil da OP.

**Parâmetros próprios por setor.** O perfil de **fiação** ganhou mistura
estruturada (componentes e percentuais, soma até 100%), título da mecha,
estiragem, velocidade do fuso, velocidade de saída e viajante. O perfil
de **tinturaria** ganhou pré-tratamento (aplicável ou não; quando
aplicável, exige tipo ou receita da empresa, com temperatura e tempo),
receita de tingimento, temperatura/tempo do banho e pH alvo. Nada é
presumido: campo vazio continua “não informado”.

Resultado atualizado: harness de banco **197 PASS / 0 FAIL** (492
migrations no replay).

## 9. Manuais de referência e carga da máquina de tingir (lote T83, 28/10/2026)

Os manuais de treinamento de PCP têxtil enviados pela empresa estão
salvos em `docs/manuais/` e o confronto item a item com o sistema está em
`docs/MAPA-MANUAL-PCP-TEXTIL.md` (provado × parcial × ausente, com os
próximos lotes priorizados).

Primeiro lote desse mapa: em **Produção → Equipamentos**, a máquina de
tingir pode ter **carga mínima/máxima da partida (kg)** e **volume útil
do banho (L)** configurados. Com os limites preenchidos, o banco rejeita
partida fora da carga ou com volume de banho (peso × relação de banho)
acima do útil; sem configuração, nenhuma validação é presumida. A tela
da OP de tinturaria avisa antes de salvar, e o banco é a barreira final.

Resultado atualizado: harness de banco **200 PASS / 0 FAIL**.

## 10. Laboratório como portão da tinturaria (lote T84, 28/10/2026)

No perfil de tinturaria, a empresa pode marcar **“Aprovação do
laboratório exigida para concluir”**. A decisão sobre a cor da partida é
registrada no próprio painel (aprovar, rejeitar ou liberar sob concessão
— concessão sempre com justificativa) e fica auditada com quem decidiu e
quando. Com a exigência marcada, o banco **bloqueia a conclusão da OP**
enquanto a decisão estiver pendente ou rejeitada; sem a marca, nada muda
e nenhuma tolerância é presumida.

Resultado atualizado: harness de banco **203 PASS / 0 FAIL**.

## 11. Receita de tingimento versionada (lote T85, 28/10/2026)

No perfil de tinturaria, **Gerenciar receitas** cadastra as receitas da
empresa como rascunho (código, nome, corantes/auxiliares e parâmetros —
só os informados). Aprovar uma nova versão substitui a aprovada anterior
do mesmo código, e a OP só pode usar **versão aprovada**: ao salvar, o
servidor copia relação de banho, temperatura, tempo e pH daquela versão
para o perfil da OP. Nenhuma dosagem é presumida ou autorizada pelo
sistema — a validação técnica é sempre da empresa.

Resultado atualizado: harness de banco **206 PASS / 0 FAIL**.

## 12. Ordem de reprocesso com genealogia (lote T86, 28/10/2026)

Na tela de lotes (WMS), um lote de produção com saldo tem a ação
**Reprocessar**: o operador escolhe a OP original, a quantidade e o
motivo, e o sistema cria uma **OP de reprocesso** própria, vinculada ao
lote original no registro `production_rework_orders`. A execução é a
normal do PCP (etapas e qualidade); ao concluir no painel de conclusão —
que reconhece a OP de reprocesso — o lote original é consumido na
quantidade reprocessada e o **lote resultante** nasce com a genealogia
original→resultante. A quantidade boa **substitui** a do lote original:
nada é somado como produção nova do artigo. Quantidade acima do saldo
restante do lote é rejeitada no banco.

Resultado atualizado: harness de banco **209 PASS / 0 FAIL**.

## 13. Setup/limpeza por troca na programação finita (lote T87, 28/10/2026)

No cadastro de equipamentos, a empresa pode informar **setup na troca
(min)** e **limpeza na troca (min)** de cada máquina. Com os tempos
preenchidos, a programação finita passa a ocupar a máquina além da
janela de produção: entre duas produções de **artigos diferentes** na
mesma máquina, o banco exige o intervalo setup + limpeza (e a mensagem
explica quantos minutos faltam). Mesmo artigo em sequência não exige
troca, e máquina sem tempos configurados não tem nenhum tempo presumido.

Resultado atualizado: harness de banco **214 PASS / 0 FAIL**.

## 14. Ficha técnica do artigo versionada (lote T88, 28/10/2026)

A construção do artigo virou cadastro próprio e versionado por produto
(`textile_article_sheets`): composição, construção/ligamento, gramatura
e largura com tolerâncias e densidades de urdume/trama entram como
**rascunho** e só passam a valer depois de **aprovados** — aprovar uma
versão nova substitui a aprovada anterior daquele artigo. O cadastro
fica em Produção → Fichas Técnicas → **Ficha do artigo (têxtil,
versionada)** e também no painel de montagem do tear da OP de
tecelagem, que só lista versões aprovadas do artigo da OP. Ao salvar, a
OP guarda um **snapshot** da versão usada: aprovar outra versão depois
não reescreve o que aquela OP executou. Campo não informado fica vazio
e nada é presumido; tolerância sem o alvo correspondente é rejeitada.

Resultado atualizado: harness de banco **219 PASS / 0 FAIL**.

## 15. Painel WIP por etapa e idade (lote T89, 28/10/2026)

Cada central setorial ganhou o painel **Trabalho em processo (WIP)**:
todas as OPs abertas do setor com a **etapa atual** do roteiro (primeira
não concluída), há quantos dias a OP está nessa etapa, a **idade real**
da ordem desde a criação, a quantidade restante e agrupamentos por
etapa (onde está o acúmulo/gargalo) e por faixa de idade. OP sem etapa
gerada aparece explicitamente como "Sem etapa gerada" — nada é estimado
e nenhum tempo é presumido. Clicar numa linha abre a OP na central.
É painel de leitura sobre as tabelas existentes (sem migration nova).

Resultado atualizado: vitest completo **406/406**; harness de banco
inalterado em **219 PASS / 0 FAIL** (sem mudança de banco nesta rodada).

## 16. Sequenciamento formal de cor por máquina (lote T90, 28/10/2026)

A fila de tinturaria já sugeria a ordem claro→escuro e sinalizava
clareamentos. Agora o cadastro de equipamentos tem a **regra formal de
cor** da máquina: ao marcar **Claro → escuro**, o banco passa a validar
as partidas vizinhas naquela máquina pelo **L* alvo** do perfil de
tinturaria — partida mais clara depois de uma mais escura (ou escura
inserida antes de uma clara) é rejeitada na programação, com a mensagem
explicando os L* envolvidos. Sem a regra marcada, continua só a
sugestão visual; partida sem L* informado não é bloqueada, porque não
há referência para validar.

Resultado atualizado: harness de banco **224 PASS / 0 FAIL**.

## 17. Etapa externa (make-or-buy) no roteiro (lote T91, 28/10/2026)

No cadastro de etapas do roteiro, uma etapa pode ser marcada como
**externa (terceirizada)**. A OP nasce com a marca no snapshot das suas
etapas e a central da OP ganha o painel **Etapas externas
(terceirização)**: envio ao fornecedor (quantidade, data de retorno
prevista, serviço) e retorno (bom e rejeitado no fornecedor) por etapa.
O banco **bloqueia concluir a etapa externa** enquanto o retorno bom
não cobrir a quantidade boa apontada — retorno parcial não libera.
Etapa não marcada segue interna, sem exigência nova, e os envios também
aparecem na tela legada de terceirização.

Resultado atualizado: harness de banco **228 PASS / 0 FAIL**.

## 18. Custo previsto × real de materiais da OP (lote T92, 28/10/2026)

A central da OP ganhou o painel **Custo previsto × real de materiais**:
por componente da ficha, a quantidade prevista (ficha × perda prevista)
e o custo previsto (× custo de referência cadastrado do componente), ao
lado da quantidade realmente consumida e do custo real (consumo × custo
do lote consumido). A variação (R$ e %) só é calculada quando o previsto
está completo e existe consumo real. Componente sem custo de referência
cadastrado fica fora do previsto e o total é marcado como parcial;
consumo sem custo de lote marca o real como incompleto. Nenhum custo é
estimado. É painel de leitura sobre ficha, cadastro e consumos
existentes (sem migration nova).

Com este lote, todos os temas do mapa manual × sistema estão provados.

Resultado atualizado: vitest completo **419/419**; harness de banco
inalterado em **228 PASS / 0 FAIL** (sem mudança de banco nesta rodada).

## 19. Correções de qualidade da central (lote T93, 28/10/2026)

Auditoria de tipos encontrou e corrigiu defeitos reais pré-existentes:
(1) os indicadores setoriais recebiam produtos/programação/categorias
trocados entre si, então prontidão do setor e eficiência de máquinas
liam dados errados — a ordem das consultas foi corrigida; (2) a tela de
OPs usava `useEffect`/`useSearchParams` sem importar (quebra ao abrir);
(3) um callback do PCP foi adaptado ao contrato do diálogo. Sem mudança
de banco nem de comportamento esperado das regras de negócio.

Resultado atualizado: vitest completo **419/419**; typecheck escopado
da central de PCP **limpo** (antes impossível pelos erros acima);
harness de banco inalterado em **228 PASS / 0 FAIL**.

## 20. Varredura de qualidade nas demais áreas (2026-10-28, T94)

A mesma auditoria de tipos da T93 foi estendida, por área e sempre com
tsgo escopado (nunca projeto inteiro no sandbox): WMS, fiscal,
comercial, financeiro, contábil, admin, core, NPS, operacional,
compras, relacionamento, operação de Loja e sucesso do cliente.
Defeitos reais achados e corrigidos:

1. `src/modules/admin/Users.tsx` usava `<SectorAccessCard />` sem
   importar o componente (existe em `admin/users/SectorAccessCard.tsx`)
   — a página de usuários quebraria ao renderizar. Import adicionado.
2. `src/modules/store-operations/components/StoreTabsPanels.tsx` usava
   `<TransferDecisionPanel />` sem import — a aba de transferências da
   Central da Loja quebraria. Import adicionado; o arquivo ainda foi
   tipado (queries soltas ganharam linhas tipadas, sem `any`).
3. `src/modules/operational/store/components/PrescriptiveAlert.tsx`
   passava `sourceBranchId` para `createRequest`, campo que a regra
   vigente retirou de propósito (a Loja solicita SEM origem; quem decide
   a origem é a análise do almoxarifado). O alerta agora usa o caminho
   único, sem inventar origem.
4. Tipagens de APIs do navegador sem mudança de comportamento:
   `webkitAudioContext` no `BarcodeScanner` do WMS e `BarcodeDetector`
   no scanner de câmera do PDV (ambos já tinham guarda e alternativa em
   runtime).

Resultado: tsgo escopado limpo em todas as áreas escaneadas; ESLint
dos arquivos tocados EXIT 0; vitest completo **419/419**; harness de
banco inalterado (228 PASS / 0 FAIL). Nenhuma migration nova.

## 21. Varredura de qualidade — roots restantes (2026-10-28, T95)

A auditoria de tipos escopada foi estendida aos roots que as varreduras
por módulo não alcançavam diretamente: `src/pages`, `src/coletor`
(aplicativo do coletor), `src/reports` e `src/routes`. `coletor`,
`reports` e `routes` estavam limpos. Defeitos reais achados e
corrigidos em `pages`:

1. `src/pages/purchasing/PurchaseOrders.tsx` chamava
   `useSearchParams()` sem nenhum import do `react-router-dom` — a
   tela de pedidos de compra quebraria ao renderizar (mesma classe do
   `ProductionOrders.tsx` da T93). Import adicionado; a consulta de
   contas a pagar do mesmo arquivo ganhou tipagem (sem `any`).
2. `src/pages/Onboarding.tsx` tinha o import de tipo `Json` duplicado
   (artefato de merge). Removida a linha duplicada.

Resultado: tsgo escopado de `pages` limpo; ESLint dos arquivos tocados
EXIT 0; vitest completo **419/419**; harness de banco inalterado
(228 PASS / 0 FAIL). Nenhuma migration nova. Com isso, toda a
superfície de código (`src/modules`, `src/pages`, `src/coletor`,
`src/reports`, `src/routes`, mais hooks/serviços/lib alcançados por
import) passou por typecheck escopado limpo nas T93–T95; a entrada
(`App.tsx`/`main.tsx`) agrega essas mesmas rotas e não é checada
sozinha porque equivale ao projeto inteiro, inviável neste sandbox.

## 22. Regressão de banco + auditoria de regras de hooks (2026-10-28, T96)

Duas frentes:

1. **Harness de banco reexecutado sobre a árvore atual** (último run
   era da T91): **228 PASS / 0 FAIL** — todas as migrations desde o
   baseline, seeds e asserções de negócio (T81–T91) continuam íntegros
   após T92–T95, que não tocaram banco.

2. **Auditoria `react-hooks/rules-of-hooks`** em todo o `src`
   (ESLint, só erros): exatamente **1 erro**, real e corrigido —
   `src/modules/wms/components/FactoryInboxPanel.tsx` chamava
   `useState` depois de um `return null` condicional de permissão;
   quando o acesso do usuário resolvia como "sem permissão", o número
   de hooks mudava entre renders e o React derrubaria a tela
   ("Rendered fewer hooks than expected") em vez de apenas ocultar o
   painel da Fábrica. O estado foi movido para junto dos demais hooks,
   antes de qualquer retorno condicional. O arquivo também ganhou
   tipagem completa (linhas da caixa de entrada, RPC e produto por
   código, sem `any`), sem mudança de comportamento das decisões.

Resultado: `rules-of-hooks` = **0** em todo o `src`; ESLint do arquivo
EXIT 0; tsgo escopado EXIT 0; vitest completo **419/419**. Os ~536
`no-explicit-any` restantes no projeto são dívida de tipagem sem efeito
de runtime; seguem fora do escopo (a regra vigente é zerar nos
arquivos tocados). Nenhuma migration nova.

## 23. Fila fiscal: falha transitória não vira rejeição (2026-10-28, T97)

Auditoria do item "worker de emissão fiscal" do RELATORIO-O-QUE-FALTA:
o transmissor Focus (`supabase/functions/fiscal-provider-worker`) já
existia e o contrato com o banco conferia, mas TODA falha virava
`rejected` definitivo — inclusive o status "processando" do fluxo
assíncrono da Focus (a autorização chega depois, via GET), token ainda
não salvo pelo cliente e erro de rede/5xx; e job travado em
`processing` nunca voltava. Correções:

1. Migration `20261028250000_fiscal_emission_retry.sql`:
   `claim_fiscal_jobs` agora grava `started_at`; nova
   `requeue_fiscal_emission` devolve job `processing` para `queued`
   com o erro registrado e, no teto de tentativas, encerra `rejected`
   com o motivo; `recover_stale_fiscal_jobs` reenfileira jobs parados
   há mais de N minutos. Só `service_role` executa.
2. Worker reescrito com classificação de desfecho: autorizado /
   rejeitado definitivo (provedor recusou) / tentar de novo
   (processando — confirmado por polling GET curto —, token ausente,
   rede, 5xx). Nada é marcado autorizado sem retorno do provedor.

Gates: harness **233 PASS / 0 FAIL** (5 cenários novos T97);
harness roda TODAS as migrations do zero a cada execução. O worker
(Deno, deploy no Supabase) foi validado por contrato de banco + revisão;
a transmissão real continua dependendo de provedor contratado e
certificado A1 do cliente (decisão 2026-10-23), como já documentado.

## 24. Revisão funcional completa (2026-10-29, T98)

Revisão pedida para "ter certeza de que está tudo funcional", contra o
manual anexado (`docs/manuais/…Pluma_ao_Tecido.md`, md5 idêntico ao já
arquivado) e o mapa manual × sistema. Portões executados sobre a árvore
atual:

| Camada | Verificação | Resultado |
| --- | --- | --- |
| Banco/regras | harness completo (reaplica TODAS as migrations do zero + seeds + 233 asserções de negócio: pluma→fiação→tecelagem→tinturaria, Loja×Fábrica, fiscal, compras/vendas→financeiro) | **233 PASS / 0 FAIL** |
| Lógica (unit) | vitest completo | **419/419** |
| Tipos | tsgo escopado por área: 14 módulos + `pages`, `coletor`, `reports` | **LIMPO** em todas |
| Hooks/lint | `rules-of-hooks` em todo o `src` (T96) | **0** (dívida restante: só `no-explicit-any`, sem efeito de runtime) |
| Mapa manual × sistema | releitura do `MAPA-MANUAL-PCP-TEXTIL.md` | 18 temas **Provado**, 1 **Parcial** declarado (mistura de fibras: configurada na OP; a rastreada de fato é a dos lotes consumidos) |

Ressalvas honestas desta revisão: (a) `src/routes` foi dado LIMPO na
T95 e não foi editado desde então — a reexecução ampla do tsgo nesta
sessão foi inviabilizada por degradação do sandbox (processos órfãos de
typecheck); os alvos das rotas (módulos e páginas) foram revalidados
acima; (b) o build de produção (Vite/Docker) roda na máquina do usuário
via `ATUALIZAR-SEGURO.bat`, não neste sandbox (~2 GB); (c) uso real
(piloto 30 dias), homologação fiscal com provedor/certificado reais e
sincronização GitHub→Lovable seguem pendentes, como listado no
RELATORIO-O-QUE-FALTA. Conclusão: funcional e provado nas camadas de
banco, lógica e tipos; a prova que falta é de uso, não de código.

## 25. Nicho por CNPJ ponta a ponta (2026-10-29, T99)

Auditoria do item 8 dos faltantes: a poda por ramo já existia em três
camadas (menu, `PrunedRoute` nas vitrines e `OperationalScopeGuard`
bloqueando `/producao/*` e `/vertical/*` por URL direta), com matriz
testada. Faltavam dois elos, corrigidos:

1. **Ramo secundário ignorado:** `companies.sub_segment` era coletado no
   onboarding ("Ramo secundário") e no cadastro da empresa, persistido e
   carregado no contexto — mas nenhuma tela o consultava. Agora
   `canPresentNicheRoute(segmento, rota, famílias, subSegmento)` libera
   as telas do ramo secundário no guard, no menu (inclusive as seções
   permitidas) e na busca.
2. **Paleta ⌘K furando a matriz:** a busca global filtrava só vitrine e
   contexto operacional, oferecendo páginas que o guard bloquearia ao
   abrir. Agora aplica a mesma `canPresentNicheRoute` (com famílias
   industriais e sub-segmento). Os arquivos tocados também foram
   tipados (buscas de produtos/OPs/pedidos de compra, sem `any`).

Gates: testes da matriz +1 suíte de sub-segmento (vitest completo
**420/420**); tsgo escopado dos arquivos EXIT 0; ESLint EXIT 0; sem
migration (o backend por módulo `niche_packages`/`has_module_access`
já era provado no harness). `docs/PODA-DE-TELAS.md` atualizado.

## 26. E2E: primeiro lote de segurança e smoke (T100)

Auditoria: os testes de Lojas existentes se dividem em smoke de telas com login e jornada transacional por API, não uma jornada completa por cliques. O executor anterior podia criar massa automaticamente e informar aprovação mesmo com testes ignorados. A jornada modifica estoque, razão pela qual deve rodar somente em instalação e banco isolados de homologação.

Alterações: executor exige confirmação de homologação, `.env.e2e` e variáveis obrigatórias; não prepara dados automaticamente; falha em testes ignorados; usa URL configurável de instalação já iniciada e propaga falha pelo `.bat`. Adicionados três testes de login sem backend, com interceptação de rede, e configuração dedicada. `docs/E2E-Lojas.md` descreve escopo e riscos. Sem migration.

Evidências: Playwright descobriu 4 testes existentes de Lojas; reporter testado com teste propositalmente ignorado, saída 1; ESLint dos arquivos novos/configuração EXIT 0. Chromium iniciou após instalar bibliotecas Linux, mas execução offline excedeu o tempo disponível durante carga da aplicação: testes de navegador NÃO comprovados. Windows/PowerShell e backend isolado não estavam disponíveis; fluxo autenticado não executado. Jornada transacional completa por cliques continua pendente.

## 27. E2E no navegador e correções encontradas (T101)

Após instalar as bibliotecas necessárias e reiniciar em ambiente sem processos de teste órfãos, os três testes Playwright offline de login passaram em Chromium (3/3). São testes de acesso anônimo e interação da tela, não validam login real nem produção.

O smoke autenticado de Loja agora também clica na aba Solicitar e verifica os campos, sem enviar. O do gestor procura a caixa na Central de Abastecimento, onde ela efetivamente está, em vez do WMS. Os campos de produto e quantidade receberam associação acessível de rótulo. Esses testes autenticados foram listados, mas não executados sem banco de homologação.

O teste transacional por API repetia APROVADA, embora a decisão já crie a transferência nesse estado; e usava `shipped_qty` inicial zero para expedição. Corrigidos a sequência, a quantidade solicitada e verificações de IDs/erros de consulta, sem alteração de RPC ou banco. Ainda requer execução real isolada. Na Central da Loja, retirados os percentuais fixos de tendência +12%/+5% e a previsão fixa “Hoje”, sem criar estimativas substitutas.

**Risco encontrado, ainda não corrigido:** `storeService.getStockReliability` retorna 99,2 sem dados, e `getStoreHealth` deriva ranking/score de fórmulas e posição sem validação; várias consultas de KPIs ignoram erros e podem mostrar zero. São indicadores não confiáveis; não usá-los para decisão operacional até a próxima correção e validação. Esta descoberta impede declarar a Central plenamente confiável.

Gates: Playwright offline 3/3; vitest 420/420; tsgo escopado da Central e dos dois testes E2E EXIT 0; ESLint dos dois testes E2E EXIT 0; sem migration. A jornada completa de abastecimento por cliques, o teste transacional por API e Windows/PowerShell continuam sem prova de execução em homologação.

## 28. Segurança do acionamento do worker fiscal (T102)

Auditoria: o worker usa `service_role`, atua em filas de várias empresas e, até T101, não autenticava o chamador. A stack local não valida JWT no gateway por padrão. Embora o acesso na instalação efetiva não tenha sido testado, a combinação exige bloqueio antes de tocar a fila.

Correção: `fiscal-provider-worker/guard.ts` envolve o handler: somente POST com bearer exatamente igual à service role ou `x-cron-secret` exatamente igual ao `CRON_SECRET` de servidor pode executá-lo; segredo ausente não libera acesso, usuário comum (inclusive administrador empresarial) não serve, GET retorna 405, OPTIONS retorna 204 sem ações. Nunca enviar qualquer desses segredos ao navegador ou gravá-los em logs. Sem migration. Integração por gateway que exija JWT também precisa de credencial própria de serviço; cabe configurar e testar o agendador interno no ambiente isolado. Não há agendador novo neste lote.

Testes: 8 cenários unitários; `deno check --no-lock` do worker; runtime Deno isolado com URL de banco inválida: POST anônimo 401, POST com token de usuário 401, GET 405 e OPTIONS 204. Os testes não acessaram dados reais. O sucesso do portão com credenciais de teste foi exercitado via unidade, não contra Supabase real.

**Implantação não comprovada:** `ATUALIZAR-SEGURO.bat` não reconstrói explicitamente a imagem `functions`, que contém uma cópia das Edge Functions. Logo, copiar o código/zip ou atualizar apenas web NÃO garante que a correção esteja ativa. Fechar atualização de funções/rollback no próximo lote e validar com autorização negada em homologação antes de qualquer uso. Emissão fiscal continua bloqueada até proteção instalada, provedor, certificado, agendador e homologação completos.

Gates adicionais: vitest completo 428/428 (93 arquivos); ESLint do guard e teste EXIT 0.
