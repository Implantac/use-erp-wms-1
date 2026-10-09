import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTokensMap(invites: { id: string }[]) {
  const inviteIds = useMemo(() => invites.map((i) => i.id), [invites]);
  const { data } = useQuery({
    queryKey: ['nps', 'tokens', inviteIds.join(',')],
    enabled: inviteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('nps_tokens').select('invite_id,token').in('invite_id', inviteIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  return useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((t) => { if (t.invite_id) m.set(t.invite_id, t.token); });
    return m;
  }, [data]);
}
