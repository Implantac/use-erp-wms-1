import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReinfTransmit } from './useReinfTransmit';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('useReinfTransmit', () => {
  it('não informa sucesso com resposta simulada legada', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true, env: 'simulated', protocol: 'SIM-123' }, error: null } as never);
    const { result } = renderHook(() => useReinfTransmit());
    await act(async () => { await result.current.transmit('period-id', 1); });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalled();
  });

  it('informa sucesso somente com confirmação e protocolo não simulado', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true, env: 'sandbox', protocol: '123', events_count: 1 }, error: null } as never);
    const { result } = renderHook(() => useReinfTransmit());
    await act(async () => { await result.current.transmit('period-id', 1); });
    expect(toast.success).toHaveBeenCalledOnce();
  });
});
