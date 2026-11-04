import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { ArticleSheet, ArticleSheetFields } from "@/lib/production/articleSheets";

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface LooseQuery<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select: (columns: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
}

interface LooseClient {
  from: <T>(table: string) => LooseQuery<T>;
}

const rpcClient = supabase as unknown as RpcClient;
const looseClient = supabase as unknown as LooseClient;

const SHEET_COLUMNS = "id, product_id, version, status, composition, construction, target_gsm, gsm_tolerance_pct, target_width_cm, width_tolerance_cm, warp_density_per_cm, weft_density_per_cm, notes, approved_at, created_at";

export async function fetchArticleSheets(companyId: string): Promise<ArticleSheet[]> {
  const response = await looseClient
    .from<ArticleSheet[]>("textile_article_sheets")
    .select(SHEET_COLUMNS)
    .eq("company_id", companyId)
    .order("version", { ascending: false })
    .limit(500);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function fetchArticleSheetsForProduct(productId: string): Promise<ArticleSheet[]> {
  const response = await looseClient
    .from<ArticleSheet[]>("textile_article_sheets")
    .select(SHEET_COLUMNS)
    .eq("product_id", productId)
    .order("version", { ascending: false })
    .limit(100);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function createArticleSheetDraft(
  productId: string,
  fields: ArticleSheetFields,
  notes: string,
): Promise<ArticleSheet> {
  const { data, error } = await rpcClient.rpc("create_article_sheet_draft", {
    p_product_id: productId,
    p_fields: fields,
    p_notes: notes.trim() || null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as ArticleSheet;
}

export async function approveArticleSheetVersion(sheetId: string): Promise<ArticleSheet> {
  const { data, error } = await rpcClient.rpc("approve_article_sheet_version", {
    p_sheet_id: sheetId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as ArticleSheet;
}

export async function fetchOrderArticleSheetId(productionOrderId: string): Promise<string | null> {
  const response = await looseClient
    .from<Array<{ article_sheet_version_id: string | null }>>("production_orders")
    .select("article_sheet_version_id")
    .eq("id", productionOrderId)
    .limit(1);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? [])[0]?.article_sheet_version_id ?? null;
}

export async function setOrderArticleSheet(productionOrderId: string, sheetId: string | null) {
  const { data, error } = await rpcClient.rpc("set_order_article_sheet", {
    p_production_order_id: productionOrderId,
    p_sheet_id: sheetId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Record<string, unknown>;
}
