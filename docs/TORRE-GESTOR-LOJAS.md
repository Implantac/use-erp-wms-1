# Torre do Gestor de Lojas — controle total da rede + consignado

**Data:** 2026-11-24 · **Status do código:** implementado, testado (699/699),
typecheck e lint limpos. **Migration:** `20261124100000_manager_store_control_consignment.sql`
(aplicar no próximo `supabase db reset` / atualização de instalação).

## 1. O que esta entrega resolve

Pedido do gestor da fábrica (2026-11-24):

1. **Controle total das lojas** — estoque de cada loja individualmente e
   visão consolidada;
2. **Ajuda nas decisões de reposição** — remanejar entre lojas conforme o
   giro, deslocar do CD, da fábrica ou produzir;
3. **Antecipação de ruptura** — quanto tempo o estoque da loja dura;
4. **Consignado completo** — envio fábrica→loja, venda, **patrocínio**
   (peça cedida mesmo sendo consignada), **transferência entre lojas**
   (peça parada de giro baixo → loja de giro alto) e liquidação.

## 2. Onde fica

| Camada | Arquivo |
|---|---|
| Tela (4 abas) | `src/modules/operational/store/ManagerTower.tsx` |
| Rota | `/operacional/loja/gestor` (`src/routes/StoreRoutes.tsx`) |
| Menu | Rede & Distribuição → “Torre do Gestor de Lojas” (`src/config/navigation/sections/rede.ts`) |
| Busca (Ctrl+K) | “Torre do gestor de lojas” (`CommandPalette`) |
| Serviço de dados | `src/services/operational/store/managerTowerService.ts` |
| Serviço de consignado | `src/services/operational/store/consignmentService.ts` |
| Lógica pura + testes | `src/lib/manager/{coverageMath,consignmentMath}.ts` (+ `.test.ts`) |
| Banco | `supabase/migrations/20261124100000_manager_store_control_consignment.sql` |

## 3. As 4 abas

1. **Consolidado** — KPIs da rede (estoque próprio em R$, valor em
   consignação, SKUs em ruptura, a liquidar) + tabela por unidade: estoque,
   rupturas, **menor cobertura**, consignado (un/valor), a liquidar, em
   trânsito, tarefas críticas. Fábrica e CD aparecem como origem.
2. **Cobertura & Ruptura** — produto × loja com demanda média diária real
   (RPC `get_branch_daily_demand`, 30 dias), saldo projetado (saldo −
   reservado + trânsito), **dias até zerar** e **data prevista de ruptura**.
   Filtros por loja e situação (Ruptura/Atenção/Saudável/Excesso/Sem giro).
   Limiares iguais ao `stockEngine`: crítico < 1 dia ou < 50% do mínimo;
   atenção < 3 dias.
3. **Reposições** — o `replenishmentEngine` roda para **todas** as lojas e
   prescreve a ação:
   - **Remanejar entre lojas** → botão cria `create_stock_transfer_request`
     (nasce `SUGERIDA`; aprovação segue a máquina de estados existente);
   - **Deslocar do CD / Pedido à fábrica** → `create_supply_request`
     (aparece na Caixa de Entrada da Fábrica);
   - **Produzir/comprar** → atalho para o MRP.
4. **Consignado** — ver §5.

## 4. Modelo de dados (consignado)

```
consignment_shipments   envio fábrica/CD → loja (EM_TRANSITO → RECEBIDA)
consignment_items       itens do envio (qtd, preço consignação, preço varejo)
consignment_balances    propriedade por loja × produto
                        (recebido, vendido, patrocinado, devolvido,
                         transferido in/out, valor consignado, liquidado)
consignment_movements   livro: ENVIO, RECEBIMENTO, VENDA, PATROCINIO,
                        DEVOLUCAO, TRANSFERENCIA_IN/OUT, LIQUIDACAO
v_consignment_balances  view com qty_available e pending_value
```

**Regra de ouro:** as peças entram no **estoque físico da loja** pelo ledger
único do sistema (`stock_movements` + trigger `apply_stock_movement_to_balance`)
— inventário, WMS e kardex enxergam as peças. A **propriedade** (a loja não é
dona até vender/liquidar) vive nas tabelas `consignment_*`.

- Venda consignada lança `type='sale'` → **conta no giro/demanda**
  (`get_branch_daily_demand`);
- Patrocínio lança `type='sponsorship'` → **não conta** como demanda (não é
  venda) e o custo é absorvido pela fábrica (gera dívida zero da loja);
- Remanejo/transferência usa tipos próprios (`consignment_transfer_*`) → não
  infla a demanda da origem;
- Trava de estoque negativo (`enforce_inventory_policy`) continua valendo:
  os RPCs checam saldo físico e consignado **antes** de movimentar.

## 5. RPCs (todas SECURITY DEFINER — escrita só por elas)

| RPC | Papel exigido | Efeito |
|---|---|---|
| `create_consignment_shipment(origem, destino, itens, obs)` | gestor (matriz viewer) | cria envio `EM_TRANSITO`, baixa estoque da origem (`consignment_out`) |
| `receive_consignment_shipment(envio, recebidos?)` | loja destino ou gestor | entrada na loja (`consignment_in`), credita `consignment_balances`, fecha envio |
| `register_consignment_sale(loja, produto, qtd, preço?, obs?)` | loja própria ou gestor | baixa física + `type='sale'` (giro), `qty_sold`, gera valor a liquidar |
| `register_consignment_sponsorship(loja, produto, qtd, obs?)` | loja própria ou gestor | baixa física + `type='sponsorship'`, custo pela fábrica |
| `transfer_consignment_stock(de, para, produto, qtd, obs?)` | gestor ou loja envolvida | remanejo: físico sai/entra + propriedade migra com o valor |
| `return_consignment_stock(loja, para_fábrica, produto, qtd, obs?)` | loja própria ou gestor | devolução física + `qty_returned` |
| `settle_consignment(loja, valor, obs?)` | gestor/financeiro/loja | liquidação proporcional aos produtos devedores |
| `get_consignment_network()` | qualquer autenticado | posição loja × produto (RLS company+branch) |

RLS de leitura nas 4 tabelas: empresa do usuário + (gestor da matriz **ou**
minha loja). Sem GRANT de INSERT/UPDATE/DELETE para o cliente — só RPC.

## 6. Remanejo por giro (o exemplo da calça)

`suggestConsignmentTransfers` (`src/lib/manager/consignmentMath.ts`, puro e
testado): para cada produto com saldo em ≥2 lojas —

- **origem** = maior cobertura (≥ 45 dias) → peça parada, giro baixo;
- **destino** = menor cobertura (< 7 dias) com demanda real → giro maior,
  mercadoria faz falta;
- **quantidade** = o que falta para o destino chegar a 30 dias, limitada ao
  excedente da origem (ela mantém 30 dias para si).

Aparece na aba Consignado em “💡 Remanejo por giro sugerido” com botão
**Mover N un** que chama `transfer_consignment_stock`.

## 7. Provas

- **Testes:** 25 novos (`coverageMath` 12 + `consignmentMath` 13) —
  suíte completa **699/699** com `vitest --maxWorkers=1`;
- **Lint:** `lint-ci.mjs` → 0 erros, 0 avisos;
- **Typecheck:** escopado nos arquivos novos (`tsc` limpo);
- **Não provado aqui:** execução das RPCs contra Postgres (sandbox sem
  Docker/psql) e E2E de navegador — fazer o roteiro do §8.

## 8. Pendências para homologar

1. Aplicar a migration na instalação-alvo (`REPARAR-BANCO.bat` /
   `supabase db reset` + seed) — conta passa a ter **506 migrations**;
2. Roteiro manual: gestor envia 10 peças em consignação → loja recebe →
   vende 2 → patrocínia 1 → transfere 3 para a outra loja (giro) → devolve 1
   → liquida o vendido; conferir saldo físico × consignado × ledger;
3. Conferir que a venda consignada aparece no giro da loja (aba Cobertura);
4. E2E: adicionar jornada ao harness (padrão `isolated-store-chain`).
