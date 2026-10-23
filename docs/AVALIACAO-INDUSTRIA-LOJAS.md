# Avaliação — cliente "indústria + 04 lojas" × USE ERP WMS

**Data:** 2026-10-21 · **Pedido:** indústria (empresa principal) produz para as
próprias lojas e para lojistas terceiros; a indústria controla o estoque das
lojas, sabe quando/o que enviar, enxerga fábrica/CD/lojas individual e
consolidado, detecta ruptura por giro, remaneja entre lojas; a loja solicita
reposição e o gestor decide: produzir, remanejar ou transferir do CD.

**Método:** inspeção do código e do banco (não de telas isoladas). Status por
requisito: ✅ atende · 🟡 atende parcial/com ressalva · ❌ não atende.

## Veredito em uma linha

**Atende ao cenário com as lojas como FILIAIS da empresa-indústria** (modelo
que o sistema já implementa de ponta a ponta no código) — com homologação
assistida recomendada antes da venda. **Com lojas como empresas (CNPJs)
separadas, atende parcial**: a visão consolidada do grupo existe no banco,
mas a reposição física entre empresas não está ligada (nesse desenho, o
correto fiscalmente é a indústria *vender* às lojas, fluxo que já existe).

## Matriz requisito × evidência

| # | Requisito | Status | Evidência no projeto |
|---|---|---|---|
| 1 | Indústria = empresa principal; lojas subordinadas | ✅ (filiais) 🟡 (CNPJs) | `branches` com tipo indústria/CD/filial sob a empresa; para CNPJs separados há `companies.parent_company_id` + `get_consolidated_company_ids()` (recursiva), usada por visões executivas — mas não pelas telas de estoque |
| 2 | Controle da indústria sobre o estoque das lojas | ✅ | Matriz de estoque produto × unidade (`useEstoqueMatrix`, `SmartReplenishment`): fábrica, CD e cada loja, com mín/máx, lead time, em trânsito e venda média diária |
| 3 | Saber **quando e o quê** enviar | ✅ | Motor de reposição (`replenishmentEngine`): cobertura em dias, demanda projetada, políticas por produto/unidade (`replenishment_policies`: estoque mínimo, cobertura-alvo), classe ABC/giro |
| 4 | Visão fábrica/CD/lojas individual **ou consolidada** | ✅ (filiais) | Matriz consolidada força todas as unidades (`forceConsolidated`); filtro por canal (varejo PDV × atacado/indústria) e por unidade |
| 5 | Ruptura por giro e remanejamento entre lojas | ✅ | Sugestões cruzam **ruptura** (unidade abaixo do mínimo/zerada = prioridade crítica) × **surplus** (unidade > 1,5× o mínimo) e recomendam a melhor origem: fábrica, CD ou **loja com sobra**; um clique cria a transferência |
| 6 | Loja solicita reposição | ✅ | Central da loja (`StoreOperations`): "Solicitar mercadoria" ao CD/rede, com recomendações automáticas da própria loja e fluxo `SUGERIDA → APROVADA → RESERVADA → CONFERÊNCIA → EXPEDIDA → EM TRÂNSITO → RECEBIDA` (`stock_transfer_orders` + `transferWorkflow`) |
| 7 | Gestor decide: produzir × remanejar × CD | 🟡 | Transferir (CD ou loja) é executável na hora; quando a rede não tem o produto, o motor **recomenda** "pedido de compra/produção" e o PCP/MRP líquido gera a OP — mas ainda não é um botão único na mesma tela (são dois passos na mesma plataforma) |
| 8 | Produção alimenta lojas e lojistas terceiros | ✅ | PCP têxtil/industrial completo (provado) + pedidos de venda e expedição WMS por lote para lojistas (provado: fluxo comercial 33/33) |
| 9 | Movimentação auditável entre unidades | ✅ | Transferência de canal grava `stock_movements` (`transfer_out`/`transfer_in`), confere recebimento com quantidade recebida e tem máquina de estados endurecida (migration de 2026-09-08) |
| 10 | Loja vende (PDV) | ✅ | Módulo PDV/varejo por canal (`VAREJO_PDV`), catálogo e terminais por loja |

## Ressalvas honestas (o que eu não assino sem provar)

1. **Esta camada (lojas/transferências/reposições) não passou pela nossa
   bateria de provas** como o PCP têxtil passou (462 migrations, 55/55).
   O código é real e integrado ao ledger, mas recomendamos um **roteiro de
   aceite específico** antes de vender: 1 indústria + 1 CD + 2 lojas, venda
   na loja, solicitação, decisão do gestor, transferência, recebimento e
   conferência de saldos — mesmo padrão dos fluxos já homologados.
2. **Decisão "mandar produzir"** é assistida (recomendação + MRP), não
   automática em um clique a partir da sugestão de reposição. Fechável em
   um lote pequeno ligando a sugestão ao `mrp_purchase_requests`/criação de
   OP já existentes.
3. **Lojas com CNPJ próprio** mudam o desenho: transferência física entre
   empresas distintas não é o caminho fiscal (o correto é venda
   indústria→loja com NF-e + financeiro espelhado). Hoje o sistema atende
   isso como venda a lojista; a **gestão central do estoque da loja**
   (consignação) seria uma fase 2 desenhada sobre `get_consolidated_*`.

## Desenho recomendado para este cliente

- **Se as 4 lojas são filiais do mesmo CNPJ raiz:** cadastrar 1 empresa
  (indústria) + filiais tipo indústria/CD/loja. Tudo acima funciona no
  modelo atual; NF-e por filial conforme certificado/IE de cada uma.
- **Se são CNPJs separados:** fase 1 = indústria vende às lojas (pedido +
  expedição + financeiro) e o gestor acompanha o consolidado do grupo;
  fase 2 (sob contrato) = gestão central de estoque das lojas
  (consignação/reposição intercompany) sobre a função de consolidação.

## Próximos passos sugeridos

1. Confirmar o CNPJ das lojas (filial × empresa separada) — define o desenho.
2. Roteiro de aceite executável do cenário (1 indústria, CD, 2 lojas) no
   ambiente local, com saldos conferidos no ledger.
3. Lote "decisão produzir" na tela de sugestões (OP/compra em um clique).
4. Só então proposta comercial com piloto de 1 loja + CD por 30 dias.
