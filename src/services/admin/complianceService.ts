export interface SecurityMetric {
  title: string;
  status: 'secure' | 'warning' | 'critical';
  description: string;
  lastChecked: string;
}

// Informações de auditoria só podem ser publicadas a partir de verificações efetivamente executadas.
export const complianceService = {
  async getSecurityMetrics(): Promise<SecurityMetric[]> {
    return [
      {
        title: 'Segurança e isolamento de tenant',
        status: 'warning',
        description: 'Não verificado neste ambiente. Execute auditoria de RLS, Vault, ledger e LGPD com evidências.',
        lastChecked: 'Não verificado',
      },
    ];
  },
  async runSecurityScan(): Promise<never> {
    throw new Error('Scanner de segurança não implementado: nenhuma certificação foi emitida.');
  },
};
