# Revisão do fluxo da Loja — testando como usuário de Loja

_Evidência: harness de banco (107 checks), vitest, revisão linha a linha das telas da jornada. Data: 22/10/2026._

---

## A jornada como ela deve ser (fluxo único)

```
1. ANALISAR O ESTOQUE → Central da Loja (ou Operação da Loja > Estoque):
   produto, foto, saldo, mínimo/máximo e situação (RUPTURA / ABAIXO DO MÍNIMO / OK).

2. SOLICITAR → botão "Solicitar abastecimento" (no estoque, nas recomendações
   ou no botão SOLICITAR MERCADORIA). A Loja NÃO escolhe a origem.

3. ANÁLISE DO ALMOXARIFADO → o gestor vê os saldos candidatos do grupo
   (outra Loja com saldo parado = remanejo, CD Loja, fábrica) e decide.

4. FLUXO GERADO → origem Loja/CD: transferência criada já APROVADA;
   origem fábrica: pedido intercompany ao gestor da indústria (vender,
   transferir, remanejar ou produzir).

5. SEPARAR / EXPEDIR → unidade de origem executa nas telas de transferência
   (Central de Abastecimento mostra a malha inteira).

6. RECEBER → a Loja confere quantidades; diferença vira divergência
   automática e o saldo entra pelo ledger único.
```

## Achados (e situação)

| # | Achado | Gravidade | Situação |
|---|--------|-----------|----------|
| F1 | **Três portas de pedido, três modelos**: (a) recomendação com origem escolhida (`stock_transfer_orders`), (b) abastecimento sem origem (`supply_requests`), (c) dialog WMS (`transferencias_canal`) + tela sobre modelo legado (`supply_chain_movements`). Cada tela mostrava um conjunto diferente → "fluxo não claro", telas zeradas | **Alta** | **Corrigido**: a Loja só pede por (b); (a) virou exibição informativa de onde há saldo; o botão "Nova Solicitação" da Central de Abastecimento leva à Central da Loja |
| F2 | Central de Abastecimento lia o modelo legado (inglês) que nada alimenta | Alta | **Corrigido**: lê o fluxo oficial com tradução de status; histórico dos logs oficiais |
| F3 | Estoque da unidade sem foto, sem máximo, sem ação | Média | **Corrigido**: foto, mín/máx, situação e botão **Solicitar** na própria linha |
| F4 | `getSmartInventorySuggestions` com valor fixo ("Mocked balance") | Média | **Removido** (cálculo real política × saldo) |
| F5 | Motor de reposição dependia de JOIN que pode falhar em silêncio | Média | **Corrigido**: busca em duas etapas |
| F6 | Nomes parecidos (Central da Loja × Operação da Loja × Central de Abastecimento) sem explicar o papel de cada um | Baixa | **Mitigado**: textos das telas agora descrevem o fluxo 1→4; renomear menus fica para decisão de produto |

## O que continua legado (decisão registrada, não escondida)

- `transferencias_canal` (WMS > Transferências por canal) e `supply_chain_movements`
  (legado inglês) seguem existindo para as telas de WMS que os usam. **Não foram
  alimentados com dados de Loja** (seria um segundo/terceiro ledger). Aposentá-los
  exige migrar as telas de WMS que ainda os leem — item P1 do plano.
- Avanço de etapa continua **somente pelo servidor** (RPCs com máquina de estados);
  a Central de Abastecimento é leitura/acompanhamento, como a própria tela avisa.

## Roteiro de teste (como usuário de Loja)

1. Empresa **TEXAS FARM STORE**, unidade **Loja** → **Central da Loja**.
2. Aba **Reposição**: CM639 em ruptura com "Onde há saldo: Loja 2 (45)" → **Solicitar abastecimento**.
3. **Análise de abastecimento** (mesma aba): o pedido aparece → em **Loja 2** clique **Atender desta origem** → transferência criada APROVADA.
4. **Central de Abastecimento**: acompanhe Separação → Expedida → Em Trânsito.
5. Volte à **Central da Loja > Recebimentos/tarefas** e receba conferindo (receba 9 de 10 e veja a divergência).
6. Confira o saldo da CM639 na Loja (aba Estoque) — subiu pelo ledger.
