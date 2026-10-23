import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { isHiddenHref } from '@/config/adaptive';

/**
 * Guarda de rota da poda de vitrine: tela escondida do menu também não
 * abre por URL direta (para a empresa/nicho). Admin de sistema mantém
 * acesso para avaliação técnica. Enquanto o nicho carrega, não bloqueia.
 */
export function PrunedRoute({ href, fallback, children }: { href: string; fallback: string; children: ReactNode }) {
  const { segment, role } = useEnterprise();
  if (role !== 'system_admin' && isHiddenHref(segment, href)) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
