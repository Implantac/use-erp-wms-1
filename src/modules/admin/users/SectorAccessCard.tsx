import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useUsers } from '@/hooks/system/useUsers';
import { useSectorAccess } from '@/hooks/production/useSectorAccess';
import { SECTOR_LABELS, type SectorKind } from '@/lib/pcp/sectorProfiles';
import type { SectorAccessLevel } from '@/lib/pcp/sectorAccess';

const NONE = '__none__';
const SECTORS: SectorKind[] = ['fiacao', 'tecelagem', 'malharia', 'tinturaria', 'beneficiamento'];
const LEVELS: Array<{ value: SectorAccessLevel; label: string }> = [
  { value: 'viewer', label: 'Visualiza' },
  { value: 'operator', label: 'Opera (aponta)' },
  { value: 'manager', label: 'Gerencia (perfil/programa)' },
];

interface GrantRow {
  user_id: string;
  sector: string;
  access_level: string;
}

/**
 * Concessões de acesso por setor do PCP têxtil (RPC set_user_sector_access).
 * Só administradores da empresa veem e alteram. Regra do banco: enquanto
 * NÃO existir nenhuma concessão, todos os usuários acessam todos os
 * setores (modo legado); a primeira concessão liga o modo restrito.
 */
export function SectorAccessCard() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  const { data: ctx } = useSectorAccess();
  const { users } = useUsers();
  const queryClient = useQueryClient();
  const [savingKey, setSavingKey] = useState('');

  const grants = useQuery({
    queryKey: ['sector-access-grants', companyId],
    enabled: Boolean(companyId && ctx?.is_admin),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_sector_access')
        .select('user_id, sector, access_level')
        .eq('company_id', companyId);
      if (error) throw new Error(error.message);
      return (data ?? []) as GrantRow[];
    },
  });

  const levelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const grant of grants.data ?? []) map.set(`${grant.user_id}:${grant.sector}`, grant.access_level);
    return (userId: string, sector: SectorKind) => map.get(`${userId}:${sector}`) ?? NONE;
  }, [grants.data]);

  if (!ctx?.is_admin) return null;

  const change = async (userId: string, userName: string, sector: SectorKind, value: string) => {
    const key = `${userId}:${sector}`;
    setSavingKey(key);
    try {
      const { error } = await (supabase as any).rpc('set_user_sector_access', {
        p_user_id: userId,
        p_sector: sector,
        p_level: value === NONE ? null : value,
      });
      if (error) throw new Error(error.message);
      toast.success(
        value === NONE
          ? `Acesso de ${userName} a ${SECTOR_LABELS[sector]} revogado`
          : `${userName}: ${SECTOR_LABELS[sector]} = ${LEVELS.find((l) => l.value === value)?.label}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['sector-access-grants'] });
      await queryClient.invalidateQueries({ queryKey: ['my-sector-access'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar concessão');
    } finally {
      setSavingKey('');
    }
  };

  const enforced = (grants.data?.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" /> Acesso por setor (PCP têxtil)
        </CardTitle>
        <CardDescription>
          Quem abre, opera e gerencia cada central de PCP. A regra é do banco: as telas só
          refletem o que as RPCs impõem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!enforced && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Modo legado ativo:</strong> ainda não há nenhuma concessão — todos os usuários
            da empresa acessam todos os setores. Ao salvar a primeira concessão, o modo restrito
            liga: cada pessoa passa a ver só os setores concedidos (administradores sempre veem todos).
          </p>
        )}
        {grants.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando concessões…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Usuário</th>
                  {SECTORS.map((sector) => (
                    <th key={sector} className="px-2 py-2 font-medium">{SECTOR_LABELS[sector]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    {SECTORS.map((sector) => {
                      const key = `${user.id}:${sector}`;
                      return (
                        <td key={sector} className="px-2 py-2">
                          <Select
                            value={levelOf(user.id, sector)}
                            onValueChange={(value) => void change(user.id, user.name, sector, value)}
                            disabled={savingKey === key}
                          >
                            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Sem acesso</SelectItem>
                              {LEVELS.map((level) => (
                                <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Visualiza = abre a central; Opera = registra eventos/apontamentos; Gerencia = altera o
          perfil técnico e programa. Revogar de todos os setores de todos os usuários desliga o
          modo restrito (volta o modo legado).
        </p>
      </CardContent>
    </Card>
  );
}
