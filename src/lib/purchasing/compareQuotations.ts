export interface CompareItem { product_id: string | null; description: string; unit_price: number | null }
export interface CompareQuotation { id: string; status: string; items?: CompareItem[] }
export interface CompareRow<Q> { label: string; offers: { quotation: Q; price: number }[]; best: number }

/** Agrupa itens por produto (ou descrição) de cotações respondidas/aprovadas, ordenando do menor preço ao maior. */
export function compareQuotations<Q extends CompareQuotation>(quotations: Q[]): CompareRow<Q>[] {
  const map = new Map<string, { label: string; offers: { quotation: Q; price: number }[] }>();
  for (const q of quotations) {
    if (q.status !== 'answered' && q.status !== 'approved') continue;
    for (const it of q.items ?? []) {
      if (it.unit_price === null) continue;
      const key = it.product_id ?? it.description.trim().toLowerCase();
      const row = map.get(key) ?? { label: it.description, offers: [] };
      row.offers.push({ quotation: q, price: it.unit_price });
      map.set(key, row);
    }
  }
  return [...map.values()].map((r) => {
    const offers = [...r.offers].sort((a, b) => a.price - b.price);
    return { label: r.label, offers, best: offers[0].price };
  });
}
