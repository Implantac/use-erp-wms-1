// Legacy browser orchestrator cannot complete a sale: it previously updated only
// the order, then announced inventory/financial effects through an in-memory bus.
// Sale completion requires an authorized, idempotent server transaction.
export class SalesOrchestrator {
  static async completeSale(_orderId: string, _companyId: string): Promise<never> {
    throw new Error('Conclusão de venda indisponível: estoque, financeiro e fiscal não são transacionados por este serviço.');
  }
}
