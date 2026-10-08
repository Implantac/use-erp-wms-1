import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Dock, YardAppointment, YardVehicle } from './types';

export function useYardData() {
  const qc = useQueryClient();

  const vehiclesQ = useQuery({
    queryKey: ['yard_vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yard_vehicles')
        .select('*')
        .order('arrived_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as YardVehicle[];
    },
  });

  const apptsQ = useQuery({
    queryKey: ['yard_appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yard_appointments')
        .select('*')
        .order('scheduled_start', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as YardAppointment[];
    },
  });

  const docksQ = useQuery({
    queryKey: ['wms_docks_min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wms_docks').select('*').limit(100);
      if (error) throw error;
      return (data || []) as Dock[];
    },
  });

  const vehicles = useMemo(() => vehiclesQ.data || [], [vehiclesQ.data]);
  const appts = useMemo(() => apptsQ.data || [], [apptsQ.data]);
  const docks = docksQ.data || [];

  const kpis = useMemo(() => {
    const waiting = vehicles.filter((v) => v.status === 'waiting').length;
    const docked = vehicles.filter((v) => ['docked', 'loading', 'unloading'].includes(v.status)).length;
    const today = new Date().toISOString().slice(0, 10);
    const apptsToday = appts.filter((a) => a.scheduled_start.slice(0, 10) === today).length;
    const noShow = appts.filter((a) => a.status === 'no_show').length;
    return { waiting, docked, apptsToday, noShow };
  }, [vehicles, appts]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, dock_id }: { id: string; status: string; dock_id?: string | null }) => {
      const patch: Record<string, unknown> = { status };
      if (status === 'docked') patch.docked_at = new Date().toISOString();
      if (status === 'finished' || status === 'cancelled') patch.finished_at = new Date().toISOString();
      if (dock_id !== undefined) patch.dock_id = dock_id;
      const { error } = await supabase.from('yard_vehicles').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status atualizado');
      qc.invalidateQueries({ queryKey: ['yard_vehicles'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Falha ao atualizar'),
  });

  const dockLabel = (id: string | null) => {
    if (!id) return '—';
    const d = docks.find((x) => x.id === id);
    return d?.name || d?.code || id.slice(0, 6);
  };

  return {
    vehicles,
    appts,
    docks,
    loadingV: vehiclesQ.isLoading,
    loadingA: apptsQ.isLoading,
    refetchV: vehiclesQ.refetch,
    refetchA: apptsQ.refetch,
    kpis,
    updateStatus,
    dockLabel,
  };
}
