import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subHours, startOfHour, format } from 'date-fns';
import { useRFID } from '@/hooks/system/useRFIDQuery';
import { ZONE_COLORS, STATUS_COLORS, STATUS_LABELS } from './constants';

export function useRFIDDashboard() {
  const queryClient = useQueryClient();
  const { readers, readersLoading, tags, tagsLoading, getEvents } = useRFID();

  // QA-UX (rodada 3): botao "Atualizar" recarregava a pagina inteira,
  // perdendo filtros, scroll e qualquer rascunho. Agora só re-busca os dados.
  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rfid_readers'] }),
      queryClient.invalidateQueries({ queryKey: ['rfid_tags'] }),
      queryClient.invalidateQueries({ queryKey: ['rfid_events'] }),
    ]);
  }, [queryClient]);
  const { data: events = [], isLoading: loadingEvents } = getEvents(500);

  const loading = readersLoading || tagsLoading || loadingEvents;

  const summary = useMemo(() => ({
    totalReaders: readers.length,
    activeReaders: readers.filter(r => r.status === 'active').length,
    totalTags: tags.length,
    activeTags: tags.filter(t => t.status === 'active').length,
    eventsToday: events.length,
    unprocessedEvents: events.filter(e => !e.processed).length,
  }), [readers, tags, events]);

  const eventsPerHour = useMemo(() => {
    const now = new Date();
    const hours: { hour: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const h = startOfHour(subHours(now, i));
      const nextH = startOfHour(subHours(now, i - 1));
      const count = events.filter(e => {
        const d = new Date(e.createdAt);
        return d >= h && d < nextH;
      }).length;
      hours.push({ hour: format(h, 'HH:mm'), count });
    }
    return hours;
  }, [events]);

  const eventsByZone = useMemo(() => {
    const zoneMap: Record<string, number> = {};
    events.forEach(e => {
      const z = e.zone || e.location || 'Sem zona';
      zoneMap[z] = (zoneMap[z] || 0) + 1;
    });
    return Object.entries(zoneMap)
      .map(([name, value]) => ({ name, value, fill: ZONE_COLORS[name] || 'hsl(var(--muted-foreground))' }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [events]);

  const readerStatusData = useMemo(() => {
    const statusMap: Record<string, number> = {};
    readers.forEach(r => { statusMap[r.status] = (statusMap[r.status] || 0) + 1; });
    return Object.entries(statusMap).map(([key, value]) => ({
      name: STATUS_LABELS[key] || key,
      value,
      fill: STATUS_COLORS[key as keyof typeof STATUS_COLORS] || 'hsl(var(--muted-foreground))',
    }));
  }, [readers]);

  const tagAlerts = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return tags.filter(t =>
      t.status === 'lost' || t.status === 'damaged' ||
      (t.status === 'active' && t.lastReadAt && (now - new Date(t.lastReadAt).getTime() > dayMs))
    ).slice(0, 8);
  }, [tags]);

  const offlineReaders = useMemo(() => {
    const now = Date.now();
    const threshold = 30 * 60 * 1000;
    return readers.filter(r =>
      r.status === 'active' && (!r.lastHeartbeat || (now - new Date(r.lastHeartbeat).getTime() > threshold))
    );
  }, [readers]);

  return { readers, tags, events, loading, summary, eventsPerHour, eventsByZone, readerStatusData, tagAlerts, offlineReaders, refetch };
}
