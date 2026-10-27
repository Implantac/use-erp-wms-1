import { describe, expect, it } from 'vitest';
import { groupSmartSuggestionsForFactory } from './supplySuggestionRequests';

describe('groupSmartSuggestionsForFactory', () => {
  it('soma sugestões do mesmo destino e produto vindas de origens diferentes', () => {
    const result = groupSmartSuggestionsForFactory([
      { id: 's1', productId: 'p1', targetBranchId: 'Loja', suggestedQty: 3 },
      { id: 's2', productId: 'p1', targetBranchId: 'Loja', suggestedQty: 2 },
      { id: 's3', productId: 'p2', targetBranchId: 'Loja', suggestedQty: 4 },
    ]);

    expect(result).toEqual([
      { targetBranchId: 'Loja', productId: 'p1', quantity: 5, suggestionIds: ['s1', 's2'] },
      { targetBranchId: 'Loja', productId: 'p2', quantity: 4, suggestionIds: ['s3'] },
    ]);
  });

  it('usa a quantidade editada e ignora quantidades inválidas', () => {
    const result = groupSmartSuggestionsForFactory(
      [
        { id: 's1', productId: 'p1', targetBranchId: 'Loja', suggestedQty: 3 },
        { id: 's2', productId: 'p2', targetBranchId: 'Loja', suggestedQty: 2 },
        { id: 's3', productId: 'p3', targetBranchId: 'l2', suggestedQty: 1 },
      ],
      { s1: 7, s2: 0, s3: Number.NaN },
    );

    expect(result).toEqual([
      { targetBranchId: 'Loja', productId: 'p1', quantity: 7, suggestionIds: ['s1'] },
    ]);
  });

  it('mantém destinos diferentes separados', () => {
    const result = groupSmartSuggestionsForFactory([
      { id: 's1', productId: 'p1', targetBranchId: 'Loja', suggestedQty: 3 },
      { id: 's2', productId: 'p1', targetBranchId: 'l2', suggestedQty: 3 },
    ]);

    expect(result).toHaveLength(2);
  });
});
