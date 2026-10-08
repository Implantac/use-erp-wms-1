// This legacy network service has no persistence or carrier/stock integration.
// Never manufacture fulfillment recommendations, manifests or tracking events.
const unavailable = (operation: string): never => {
  throw new Error(`${operation} indisponível: integração operacional não configurada.`);
};

export const orchestrationService = {
  calculateSourcing: async (_orderItems: unknown[], _companyId: string): Promise<never> => unavailable('Sourcing'),
};

export const lastMileService = {
  createManifest: async (_transferIds: string[]): Promise<never> => unavailable('Manifesto de transporte'),
  trackShipment: async (_trackingCode: string): Promise<never> => unavailable('Rastreamento de entrega'),
};
