# Plano — de piloto avançado a produto vendável (v1.1.0)

## Estado honesto hoje
- **Forte e provado:** ledger único de estoque; grupo indústria + lojas
  multi-CNPJ (separado/consolidado, remanejo, decisão vender/transferir/
  produzir); PCP têxtil setorial real; RBAC/RLS; controle de lojas ponta a
  ponta (119 checks de banco, 297 testes de unidade, typecheck limpo).
- **Não vendável ainda como ERP completo:** fiscal não homologado; modelos
  legados duplicados no WMS; publicação dependente de processo manual
  (zip + .bat); sem onboarding guiado nem suporte/CI contínuos.

## Definição de "vendável" (gates objetivos)
1. **Fiscal homologado** para o escopo vendido (NF-e e/ou NFC-e): provedor
   ou emissor próprio com certificado A1 do cliente, credenciamento SEFAZ,
   ambiente de homologação aprovado e contingência. *Depende de terceiros
   (SEFAZ/provedor) — não é só código.*
2. **Uma jornada, um modelo:** aposentar `transferencias_canal` e
   `supply_chain_movements` das telas (migrar leitores para o fluxo
   oficial) e remover o que ficar órfão.
3. **Instalação/atualização em 1 clique** com verificação automática
   (padrão VERIFICAR-*) e rollback documentado; backup/restore testados.
4. **Piloto real de 30 dias** numa operação (indústria + 2 lojas) com
   critérios de aceite assinados: ruptura atendida, divergência < 2%,
   recebimento no mesmo dia, zero ajuste manual fora do fluxo.
5. **Produto:** onboarding guiado por papel (Loja/CD/indústria), ajuda na
   tela, trilha de auditoria visível, versionamento e notas de release.

## Fases
- **Fase 1 — Consolidação (2–4 sem):** item 2 + finalidade nas telas
  (feito nas centrais), painel "Pronto para operar?" (feito), remover
  dados fabricados (feito: WMS AI), FEATURE_STATUS sempre atual.
- **Fase 2 — Piloto (30 dias):** item 4 com a operação Zipo/Texas Farm;
  backlog só de dor real do piloto; congelar features novas.
- **Fase 3 — Fiscal e comercial (4–8 sem, paralelo ao piloto):** item 1
  (decisão provedor × emissor próprio), contrato de suporte, precificação
  por empresa/unidade, termos e LGPD.

## Decisões registradas
- Não vender como "ERP completo" antes do gate 1; posicionar como
  **plataforma operacional têxtil (PCP + estoque fábrica↔lojas)** com
  fiscal via integração quando homologado.
- Nenhum segundo ledger, nenhuma telemetria/dado fabricado, nenhuma
  funcionalidade "pronta" sem prova executável (harness/teste/E2E).

## Progresso Fase 1 (2026-10-22, noite)
- `transferencias_canal`: telas do WMS migradas para o fluxo oficial via
  adapter (lista/itens/criar/confirmar/cancelar sobre stock_transfer_orders
  e RPCs); a tabela legada não recebe mais escrita dessas telas.
- Stats de rede (`useSupplyChainStats`) leem status oficiais.
- Romaneio de separação imprimível na fila de decisão.
- `networkService`: leitura migrada ao fluxo oficial; escritas legadas
  aposentadas com erro honesto. Dashboard WMS ganhou "Operação da rede
  hoje" com contagens reais do grupo.
- Restam no legado: `InventoryOrchestrator` (supply_chain_ledger, só
  testes) e `ComplianceService` (lê supply_chain_ledger) — sem escrita e
  fora das telas operacionais; remoção física junto da aposentadoria das
  tabelas.

## Frente fiscal aberta (2026-10-22)
- Decisão: provedor via API primeiro (`docs/DESENHO-FISCAL.md`).
- Entregue: `fiscal_provider_settings` por empresa + cartão "Emissor
  fiscal da empresa" em Fiscal > NF-e (configura, **não emite**) e o item
  fiscal do painel de prontidão com cobertura real de NCM/provedor.
- Próximo passo (externo): contratar provedor, certificado A1 da empresa
  piloto e rodar o checklist de homologação por UF/modelo.

## Atualização segura entregue (2026-10-23)
- `ATUALIZAR-SEGURO.bat`: backup do banco + etiqueta de rollback da
  imagem web, migrations, rebuild, verificação (healthz + página 200)
  e rollback automático da tela se a verificação falhar.
- Quadros setoriais completos: tear (tecelagem), máquinas (fiação),
  teares circulares (malharia) e cubas (tinturaria).
