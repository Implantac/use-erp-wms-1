# Roteiro de testes — Controle de Lojas (rodada completa)

Marque ✅/❌ em cada passo. Qualquer ❌: anote a tela e a mensagem exibida.

**Antes de começar:** extrair o zip → `REPARAR-BANCO.bat` → `ATUALIZAR-WEB.bat` →
`VERIFICAR-LOJAS.bat` (tudo `[OK]`) → login `etcsuporte889@gmail.com` → Ctrl+F5.

---

## C1 — Loja analisa o próprio estoque
1. Seletor de empresa → **TEXAS FARM STORE**; unidade **Loja**.
2. **Central da Loja → aba Reposição**: devem aparecer itens em ruptura/atenção
   (ex.: CAMISETA CM639 saldo 0) com selos **"Onde há saldo: Loja 2 (45) · CD (40) · Fábrica (200)"**.
3. **Operação da Loja → aba Estoque**: foto, saldo, mínimo/máximo e situação por produto.
   - Esperado: fotos visíveis; CM639 = RUPTURA.

## C2 — Loja solicita abastecimento (sem escolher origem)
1. Na aba **Reposição**, na CM639, clique **Solicitar abastecimento** (qtd sugerida).
   - Esperado: mensagem *"O almoxarifado vai analisar a melhor origem"*.
2. Confira em **Análise de abastecimento**: o pedido aparece como PENDENTE.

## C3 — Fábrica enxerga e decide: remanejo de outra Loja
1. Troque a empresa para **Zipo Confecções** → **WMS Avançado → Dashboard WMS**.
2. **Solicitações das Lojas (caixa de entrada da Fábrica)**: o pedido da CM639 está lá
   (contador de pendentes > 0). **Analisar origens** → saldos: Loja 2 = 45, CD = 40, Fábrica = 200.
3. Em **Outra Loja (Loja 2)** clique **Atender desta origem**.
   - Esperado: *"transferência criada e APROVADA"*; o pedido some dos pendentes.

## C4 — Execução e recebimento integral
1. **Abastecimento → Painel de abastecimento** (Visão: Grupo): a transferência
   Loja 2 → Loja aparece; clique nela e veja **origem, destino, itens e histórico**.
2. Na unidade de origem, avance Separação → Conferência → Expedida → Em Trânsito
   (fila de decisão/preparação). Na **Loja**, receba conferindo a quantidade total.
   - Esperado: status **RECEBIDA**; saldo da CM639 na Loja sobe (+qtd) — confira na aba Estoque.

## C5 — Recebimento parcial vira divergência + alerta
1. Repita um pedido pequeno e, no recebimento, digite **menos** que o expedido
   (ex.: expedido 10, receba 8). Antes de confirmar, a tela avisa
   *"Faltam 2 un — será registrado como DIVERGÊNCIA"*.
2. Confirme. Esperado: status **RECEBIDA COM DIVERGÊNCIA**; na **Central da Loja → Alertas**
   surge pendência **crítica** "Recebimento com divergência — tratar as faltas".

## C6 — Pedido direto à Fábrica
1. Como Loja, solicite abastecimento da **BOTINA 87060** (ou use o pendente existente).
2. Como indústria (Zipo), na caixa de entrada **Analisar origens → Fábrica → Atender desta origem**
   → vira **Pedido à Fábrica**. Decida **Transferir CD** (ou Vender).
3. Volte à Loja e **confirme o recebimento** do pedido do grupo.
   - Esperado: saldo da Loja aumenta pelo ledger (`intercompany_in` no histórico).

## C7 — Alertas nos dois lados
- **Loja → Central da Loja → Alertas**: ruptura, recebimento a conferir, divergência.
- **Indústria → Alertas**: "Loja solicitou reposição de estoque" a cada pedido novo.

## C8 — Visão do grupo
- **Zipo → WMS → Reposição Inteligente**: estoque **POR EMPRESA (SEPARADO)** e
  **CONSOLIDADO DO GRUPO** batem com a soma das unidades.

---

### Se algo não aparecer
Rode **VERIFICAR-LOJAS.bat** e compare: ele imprime quantos pedidos pendentes existem
no banco e se o frontend novo está no ar. Envie a tela do verificador + o passo (C1–C8).
