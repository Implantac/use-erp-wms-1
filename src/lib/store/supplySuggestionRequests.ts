export interface SmartSupplySuggestionInput {
  id: string;
  productId: string;
  targetBranchId: string;
  suggestedQty: number;
}

export interface FactorySupplyRequestBatchItem {
  targetBranchId: string;
  productId: string;
  quantity: number;
  suggestionIds: string[];
}

/**
 * Converte sugestões de reposição (que nascem com uma origem apenas sugerida)
 * nas solicitações oficiais que a Loja envia para a Fábrica decidir.
 * A origem sugerida é descartada de propósito; sugestões repetidas para o
 * mesmo destino/produto são somadas em uma única solicitação.
 */
export function groupSmartSuggestionsForFactory(
  suggestions: SmartSupplySuggestionInput[],
  editedQuantities: Record<string, number> = {},
): FactorySupplyRequestBatchItem[] {
  const grouped = new Map<string, FactorySupplyRequestBatchItem>();

  for (const suggestion of suggestions) {
    const quantity = Number(editedQuantities[suggestion.id] ?? suggestion.suggestedQty);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const key = `${suggestion.targetBranchId}:${suggestion.productId}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity += quantity;
      current.suggestionIds.push(suggestion.id);
    } else {
      grouped.set(key, {
        targetBranchId: suggestion.targetBranchId,
        productId: suggestion.productId,
        quantity,
        suggestionIds: [suggestion.id],
      });
    }
  }

  return [...grouped.values()];
}
