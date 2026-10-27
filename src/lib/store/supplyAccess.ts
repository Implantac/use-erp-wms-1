/**
 * Separação de papéis no abastecimento (regra operacional do produto):
 * - LOJA: só solicita e recebe mercadoria (nada de decidir origem);
 * - FÁBRICA/indústria (raiz do grupo): recebe as solicitações, analisa os
 *   saldos (Fábrica × CD × outras lojas) e decide transferência/produção/
 *   remanejo. A autorização real continua no servidor (is_group_manager /
 *   factory_inbox); aqui é a separação VISUAL das telas por papel.
 */
export interface SupplyCompanyRef { id: string; parent_company_id: string | null }
export interface SupplyRoleRef { company_id: string; role: string }

export function resolveGroupRoot(
  companies: SupplyCompanyRef[],
  startCompanyId?: string | null,
): string | null {
  if (companies.length === 0) return null;
  const byId = new Map(companies.map((c) => [c.id, c]));
  const start = (startCompanyId && byId.get(startCompanyId)) || companies[0];
  let current: SupplyCompanyRef = start;
  const seen = new Set<string>();
  while (current.parent_company_id && byId.has(current.parent_company_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parent_company_id)!;
  }
  return current.id;
}

export function canManageSupply(input: {
  companies: SupplyCompanyRef[];
  roles: SupplyRoleRef[];
  isSystemAdmin: boolean;
  currentCompanyId?: string | null;
}): { rootCompanyId: string | null; canManage: boolean } {
  const rootCompanyId = resolveGroupRoot(input.companies, input.currentCompanyId);
  if (input.isSystemAdmin) return { rootCompanyId, canManage: true };
  if (!rootCompanyId) return { rootCompanyId, canManage: false };
  const canManage = input.roles.some(
    (r) => r.company_id === rootCompanyId && ['admin', 'manager', 'admin_matriz'].includes(r.role),
  );
  return { rootCompanyId, canManage };
}
