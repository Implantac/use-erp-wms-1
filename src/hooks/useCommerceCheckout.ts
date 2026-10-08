import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleMutationError } from "@/lib/toastHelpers";

export interface CheckoutItem {
  product_id?: string | null;
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
}

export interface CheckoutAddress {
  zip: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CheckoutInput {
  storefront_id: string;
  company_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_document?: string;
  shipping_address: CheckoutAddress;
  payment_method: "credit_card" | "pix" | "boleto";
  items: CheckoutItem[];
  shipping?: number;
  discount?: number;
  notes?: string;
  // credit card (mocked / would be tokenized in production)
  card_last4?: string;
  card_brand?: string;
}

export interface StorefrontOrder {
  id: string;
  storefront_id: string;
  company_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_document: string | null;
  shipping_address: CheckoutAddress;
  payment_method: "credit_card" | "pix" | "boleto";
  payment_status:
    | "pending"
    | "processing"
    | "paid"
    | "failed"
    | "refunded"
    | "expired";
  order_status:
    | "created"
    | "confirmed"
    | "preparing"
    | "shipped"
    | "delivered"
    | "cancelled";
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  pix_expires_at: string | null;
  card_last4: string | null;
  card_brand: string | null;
  paid_at: string | null;
  created_at: string;
}

export function useCreateStorefrontOrder() {
  return useMutation({
    mutationFn: async (input: CheckoutInput): Promise<StorefrontOrder> => {
      void input;
      // No payment provider is integrated here. Never fabricate a PIX charge,
      // mark a card paid or insert an order with unverifiable payment state.
      throw new Error('Checkout indisponível: configure e homologue um provedor de pagamentos antes de aceitar pedidos. Nenhum pedido ou cobrança foi criado.');
    },
    onError: handleMutationError,
  });
}

export function useStorefrontBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["storefront_by_slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefronts")
        .select("*")
        .eq("slug", slug!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useStorefrontOrders(storefrontId: string | undefined) {
  return useQuery({
    queryKey: ["storefront_orders", storefrontId],
    enabled: !!storefrontId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_orders")
        .select("*, items:storefront_order_items(*)")
        .eq("storefront_id", storefrontId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payment_status,
      order_status,
    }: {
      id: string;
      payment_status?: StorefrontOrder["payment_status"];
      order_status?: StorefrontOrder["order_status"];
    }) => {
      if (payment_status === "paid") {
        throw new Error("Não é permitido confirmar pagamento manualmente. Aguarde confirmação autenticada do provedor.");
      }
      if (order_status && ["confirmed", "preparing", "shipped", "delivered"].includes(order_status)) {
        const { data: order, error: readError } = await supabase
          .from("storefront_orders")
          .select("payment_status")
          .eq("id", id)
          .single();
        if (readError) throw readError;
        if (order?.payment_status !== "paid") {
          throw new Error("Pedido sem pagamento confirmado não pode avançar para preparação ou entrega.");
        }
      }
      const patch: Record<string, unknown> = {};
      if (payment_status) patch.payment_status = payment_status;
      if (order_status) patch.order_status = order_status;
      if (Object.keys(patch).length === 0) throw new Error("Nenhuma alteração informada.");
      const { error } = await supabase
        .from("storefront_orders")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storefront_orders"] });
      toastSuccess("Pedido atualizado");
    },
    onError: handleMutationError,
  });
}
