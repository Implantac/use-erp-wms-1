import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateStorefrontOrder, useUpdateOrderStatus } from './useCommerceCheckout';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/toastHelpers', () => ({ handleMutationError: vi.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('checkout público sem provedor', () => {
  it.each(['pix', 'credit_card', 'boleto'] as const)('não grava pedido nem cobrança via %s', async payment_method => {
    vi.mocked(supabase.from).mockClear();
    const { result } = renderHook(() => useCreateStorefrontOrder(), { wrapper });
    await expect(act(async () => result.current.mutateAsync({
      storefront_id: 'store', company_id: 'company', customer_name: 'Teste', customer_email: 'teste@example.com',
      shipping_address: { zip: '', street: '', number: '', neighborhood: '', city: '', state: '' },
      payment_method, items: [{ product_name: 'Produto', quantity: 1, unit_price: 10 }],
    }))).rejects.toThrow('Checkout indisponível');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});


describe('transições administrativas da loja', () => {
  it('impede marcar pagamento como pago sem confirmação do provedor', async () => {
    vi.mocked(supabase.from).mockClear();
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });
    await expect(act(async () => result.current.mutateAsync({ id: 'order', payment_status: 'paid' })))
      .rejects.toThrow('Não é permitido confirmar pagamento manualmente');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('impede avançar pedido não pago para preparação', async () => {
    const update = vi.fn();
    const single = vi.fn().mockResolvedValue({ data: { payment_status: 'pending' }, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }), update } as never);
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });
    await expect(act(async () => result.current.mutateAsync({ id: 'order', order_status: 'preparing' })))
      .rejects.toThrow('Pedido sem pagamento confirmado');
    expect(update).not.toHaveBeenCalled();
  });
});
