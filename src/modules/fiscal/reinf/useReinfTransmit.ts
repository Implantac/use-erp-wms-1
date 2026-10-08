import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';

export function useReinfTransmit() {
  const [transmitting, setTransmitting] = useState(false);

  const transmit = async (periodId: string | undefined, eventsCount: number) => {
    if (!periodId) {
      toast.error('Abra a competência antes de transmitir.');
      return;
    }
    if (eventsCount === 0) {
      toast.error('Não há eventos para transmitir nesta competência.');
      return;
    }
    setTransmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reinf-transmit', {
        body: { period_id: periodId },
      });
      if (error) throw error;
      if (data?.ok && data?.env !== 'simulated' && data?.protocol) {
        toast.success('Transmissão enviada', {
          description: `Protocolo ${data.protocol} • ${data.events_count} evento(s)`,
        });
      } else {
        toast.warning('Transmissão bloqueada', {
          description: data?.message || 'Não houve confirmação de transmissão oficial.',
        });
      }
    } catch (err) {
      toast.error('Falha na transmissão', { description: errorMessage(err) });
    } finally {
      setTransmitting(false);
    }
  };

  return { transmit, transmitting };
}
