import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SectorAccessContext } from '@/lib/pcp/sectorAccess';

/**
 * Contexto de acesso setorial do usuário logado (RPC `my_sector_access`).
 * Em banco sem a migration de setores, a RPC não existe: retornamos `null`
 * e a interface não bloqueia nada (a escrita continua protegida no banco
 * assim que a migration é aplicada).
 */
export function useSectorAccess() {
  return useQuery({
    queryKey: ['my-sector-access'],
    queryFn: async (): Promise<SectorAccessContext | null> => {
      const { data, error } = await supabase.rpc('my_sector_access' as never);
      if (error || !data) return null;
      const raw = data as {
        is_admin?: boolean;
        enforced?: boolean;
        access?: Record<string, string>;
      };
      return {
        is_admin: Boolean(raw.is_admin),
        enforced: Boolean(raw.enforced),
        access: (raw.access ?? {}) as SectorAccessContext['access'],
      };
    },
    staleTime: 60_000,
  });
}
