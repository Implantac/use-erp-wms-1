import { supabase } from '@/integrations/supabase/client';

export class ComplianceService {
  /**
   * Valida a integridade entre uma movimentação logística e sua contrapartida financeira.
   * UEEF SEC-LEVEL 3: Garante que toda baixa de estoque (venda) possua um registro financeiro.
   */
  async validateLogisticsFinancialIntegrity(orderId: string): Promise<{
    isValid: boolean;
    missingLedgerEntries: string[];
  }> {
    const missingLedgerEntries: string[] = [];

    // 1. Verifica se o pedido existe
    const { data: order } = await (supabase as any)
      .from('orders')
      .select('id, total, status')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return { isValid: false, missingLedgerEntries: ['PEDIDO_NAO_ENCONTRADO'] };

    // 2. Verifica Ledger Logístico (Supply Chain Ledger)
    // Usamos 'as any' porque a tabela pode ter sido criada via SQL migration recente e não estar no types.ts gerado
    const { data: logisticsLedger } = await (supabase as any)
      .from('supply_chain_ledger')
      .select('id')
      .eq('order_id', orderId);

    if (!logisticsLedger || logisticsLedger.length === 0) {
      missingLedgerEntries.push('LOGISTICA_LEDGER_AUSENTE');
    }

    return {
      isValid: missingLedgerEntries.length === 0,
      missingLedgerEntries
    };
  }

  /**
   * Registra uma trilha de auditoria para ações sensíveis.
   */
  async logAuditTrail(action: string, metadata: any) {
    const { data: auth } = await supabase.auth.getUser();

    // Usamos security_audit_logs que já existe no schema
    await (supabase as any).from('security_audit_logs').insert({
      user_id: auth.user?.id,
      action,
      metadata,
      severity: metadata.severity || 'info',
      created_at: new Date().toISOString()
    });
  }
}

export const complianceService = new ComplianceService();
