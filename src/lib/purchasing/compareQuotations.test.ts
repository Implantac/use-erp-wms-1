import { describe, it, expect } from 'vitest';
import { compareQuotations } from './compareQuotations';

const q = (id: string, status: string, price: number | null) => ({ id, status, items: [{ product_id: 'p1', description: 'Parafuso', unit_price: price }] });

describe('compareQuotations', () => {
  it('destaca o menor preço entre fornecedores', () => {
    const [row] = compareQuotations([q('a', 'answered', 12), q('b', 'answered', 9.5)]);
    expect(row.best).toBe(9.5);
    expect(row.offers.map((o) => o.quotation.id)).toEqual(['b', 'a']);
  });
  it('ignora rascunhos, enviadas e itens sem preço', () => {
    const rows = compareQuotations([q('a', 'draft', 1), q('b', 'sent', 2), q('c', 'answered', null), q('d', 'approved', 7)]);
    expect(rows[0].offers.map((o) => o.quotation.id)).toEqual(['d']);
  });
});
