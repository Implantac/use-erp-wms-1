# Grupo multiempresa — lojas-filiais (mesmo CNPJ) × lojas-empresas (CNPJs)

**Data:** 2026-10-21 · Complementa `AVALIACAO-INDUSTRIA-LOJAS.md`.

O sistema atende os dois modelos de rede, com o mesmo objetivo: a indústria
enxerga e abastece a rede inteira, a loja pede, o gestor decide.

## Modelo A — lojas como FILIAIS (mesmo CNPJ raiz)

Já existente: empresa única, `branches` tipo indústria/CD/loja, matriz de
estoque por unidade ou consolidada, `SmartReplenishment` (ruptura × surplus),
solicitação da loja e transferência entre unidades com conferência.

**Reparo importante (2026-10-21):** o gatilho `fn_transferencia_canal_apply`
gravava `stock_movements.movement_type`, coluna removida quando o ledger
passou a `type`/`direction` — **toda transferência entre filiais falhava**
ao mudar de status. A função foi redefinida no contrato atual (lança
`transfer_out`/`transfer_in`; o saldo move pelo trigger do ledger) e há
prova executável: matriz −30 no despacho, loja +28 no recebimento
conferido com divergência.

## Modelo B — lojas como EMPRESAS do grupo (CNPJs diferentes) — NOVO

Migration `20261019220000_group_intercompany.sql`:

- **Grupo** = árvore `companies.parent_company_id` com a indústria na raiz;
  `company_group_root()` resolve a raiz e `get_consolidated_company_ids()`
  (já existente) lista o grupo.
- **`group_stock_overview()`** — estoque produto × empresa de todo o grupo,
  somente para admin/manager de empresa do grupo (checagem explícita;
  empresa de fora recebe 42501).
- **Solicitação** — a loja-empresa pede pelo próprio cadastro de produto
  (`create_intercompany_replenishment_request`); a indústria casa o produto
  dela pelo **mesmo código (SKU)** na decisão.
- **Decisão do gestor** (`decide_intercompany_request`):
  - `vender`/`transferir_cd` → cria **pedido de venda** na indústria com a
    loja como cliente (pelo CNPJ): fiscalmente correto entre CNPJs, segue
    para a expedição WMS já homologada e gera o financeiro do pedido;
  - `remanejar` → o pedido nasce na loja-origem indicada, vendendo para a
    solicitante;
  - `produzir` → status `producao_solicitada` (PCP/MRP gera a OP sem
    duplicar; a solicitação fica rastreada);
  - `rejeitar` → encerrada com autoria e data.
- **Recebimento** — a loja confirma (`receive_intercompany_delivery`) e o
  estoque entra por UM lançamento no ledger (`stock_movements`,
  `type=intercompany_in`); `stock_balances` é derivado pelo trigger, como
  em todo o sistema.
- **Telas**: Central da Loja → aba Solicitações → "Reposição — Indústria do
  grupo" (pedir, acompanhar, confirmar recebimento); reposição inteligente
  (WMS) → "Grupo — estoque consolidado" + caixa de decisão do gestor.

## Provas (harness, 464 migrations — 67/67 PASS)

Solicitação da loja → indústria decide (pedido de 100 × R$ 50 = R$ 5.000) →
loja recebe 96 pelo ledger; solicitante não decide o próprio pedido;
decisão duplicada é rejeitada; a matriz não pede a si mesma; empresa de
fora do grupo é negada na visão consolidada; transferência entre filiais
reparada com saldos conferidos.

## Limites e dívidas registradas

1. A **emissão da NF-e** da venda intercompany usa o pedido criado aqui e
   depende da homologação fiscal (provedor) — mesmo bloqueio do plano.
2. A decisão `produzir` marca a solicitação; gerar a OP em um clique a
   partir dela (via MRP líquido) é o próximo refinamento.
3. A página da loja (`StoreOperations`) ainda tem blocos demonstrativos
   antigos na aba Resumo (cartões fixos) — as abas Solicitações (grupo) e o
   motor de reposição são reais; a limpeza dos blocos fixos está registrada
   como dívida de UX/dados.
4. Consignação (indústria dona do estoque dentro da loja-CNPJ) não é o
   modelo implementado: entre CNPJs, o fluxo é venda — consignação seria
   um desenho fiscal próprio, sob demanda de cliente.
