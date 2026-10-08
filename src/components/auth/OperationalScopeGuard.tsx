import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { evaluateContextAccess, getRouteContextCriteria } from '@/core/auth/contextAccess';
import { EmptyState } from '@/shared/components/EmptyState';

const REASON_MESSAGES = {
  'unit-type': 'Esta área não está disponível para o tipo de unidade selecionado.',
  channel: 'Esta área não está disponível para o canal operacional selecionado.',
  scope: 'Selecione uma unidade específica para acessar esta área.',
  role: 'Seu perfil não possui acesso a esta área.',
  permission: 'Seu perfil não possui a permissão necessária para esta área.',
} as const;

export function OperationalScopeGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { activeUnitType, activeChannel, scope, role, permissions, isReady } = useEnterprise();
  const criteria = getRouteContextCriteria(pathname);

  if (!criteria) return <>{children}</>;
  if (!isReady) return <div role="status" className="py-10">Aguardando autorização do contexto operacional...</div>;

  const result = evaluateContextAccess(criteria, {
    unitType: activeUnitType,
    channel: activeChannel,
    scope,
    role,
    permissions,
  });

  if (result.allowed) return <>{children}</>;

  return (
    <div className="py-10">
      <EmptyState
        icon={ShieldAlert}
        title="Área indisponível neste contexto"
        description={result.reason ? REASON_MESSAGES[result.reason] : 'Troque o contexto operacional para acessar esta área.'}
      />
    </div>
  );
}