import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { TextileRouteTemplate } from "@/lib/production/textileRouteTemplates";

interface RpcClient {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

const rpcClient = supabase as unknown as RpcClient;

export interface ApplyTextileRouteTemplateResult {
  route_id: string;
  route_code?: string;
  product_id: string;
  template_key: string;
  step_count: number;
  created_operations: number;
  reused_operations: number;
  idempotent_replay: boolean;
}

export async function fetchTextileRouteTemplates(): Promise<TextileRouteTemplate[]> {
  const { data, error } = await rpcClient.rpc("textile_route_template_catalog");
  if (error) throw new Error(errorMessage(error));
  return (data as TextileRouteTemplate[] | null) ?? [];
}

export async function applyTextileRouteTemplate(input: {
  productId: string;
  templateKey: string;
  idempotencyKey: string;
  routeCode?: string;
}): Promise<ApplyTextileRouteTemplateResult> {
  const { data, error } = await rpcClient.rpc("apply_textile_route_template", {
    p_product_id: input.productId,
    p_template_key: input.templateKey,
    p_idempotency_key: input.idempotencyKey,
    p_route_code: input.routeCode?.trim() || null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as ApplyTextileRouteTemplateResult;
}
