# Genealogia têxtil — segundo incremento, 16/10/2026

**Estado:** local, sem push, migration ou escrita no Supabase. Lovable publicado permanece conectado ao banco de produção. Não usar a interface publicada para testar genealogia.

## Achados do schema existente

`stock_lots` já armazena identificador de lote, produto, quantidade/saldo, empresa e campos de qualidade; `stock_movements` já possui `lot_id`. Portanto, não se deve criar um segundo saldo têxtil independente. `material_consumptions` guarda código/batch em texto, mas não prova vínculo transacional com lote e saldo. `stock_lots` não traz unidade explícita no tipo gerado: produto pode ter unidade, mas conversões reais por processo/etapa ainda exigem contrato e aprovação. `ProductionTraceability` consumia até 200 logs, somava quantidades de unidades diferentes como «Peças Registradas» e anunciava «Histórico completo» sem grafo origem→destino.

## Entrega local

- `src/lib/textile/lineage.ts`: pré-validação **em memória** de um grafo de lotes, incluindo pertencimento à empresa, links existentes, quantidades/unidades, referência para conversão e detecção de ciclos; percorre ancestrais/descendentes de um lote sem somar kg/metros/peças. Admite múltiplos insumos por operação. Uma referência textual não autoriza conversão ou consumo real.
- `docs/governance/sql/DRAFT_textile_lineage_contract.sql`: contrato estrutural **fora de `supabase/migrations`**, sem políticas permissivas nem endpoint de gravação. Referencia `stock_lots` existentes; separa entradas/saídas de uma execução para não duplicar consumo em transformações muitos-para-muitos. **Não é migration aplicável nem prova SQL**. Requer checagem de FK por empresa, OP/empresa, produto/unidade, branch, quality hold, versionamento, estoque real e ledger transacional antes de qualquer aplicação.
- `useProductionLogs` passou a filtrar a empresa ativa e a descartar resultado antigo ao trocar de tenant; removeu escrita genérica sem consumidor. A página de rastreabilidade agora distingue «últimos 200 logs» de genealogia, não soma quantidades incompatíveis nem apresenta zero como verdade em erro de consulta. O log da OP não chama quantidade sem unidade de «peças». Esses logs **não** formam um recall completo.

## Aceite futuro em homologação

1. Levantamento do estado efetivo de `stock_lots`, movimentos, lotes legados, qualidade, unidades e RLS de duas empresas/unidades. Inventariar custo, consignação, produto do cliente e reversões; nenhuma migração automática de dados.
2. RPC transacional idempotente: bloquear OP e lotes, confirmar operador, roteiro/receita versionados, liberar qualidade, debitar quantidades do ledger existente, gerar/creditar lotes de saída, registrar consumo e vínculos com rollback integral. Verificar saldo não negativo, duplicidade de requisição, partição/fusão/retrabalho e estorno.
3. Recall para frente e para trás inclusive lote misturado, fio→tecido plano e malha paralelos, banho/reprocesso de tinturaria, expedição e devolução; confirmar resultado com inventário real e material físico.
4. Piloto no Lovable de teste ligado a Supabase isolado, revisão DBA/engenharia/QA e aceite escrito. **Não liberar produção.**

Testes locais: `npx vitest run src/lib/textile/lineage.test.ts` 3/3, `node --test scripts/test-textile-lineage-gate.mjs` 2/2, typecheck, lint, `git diff --check`. Não são ensaio de banco, RLS, saldo ou transação.
