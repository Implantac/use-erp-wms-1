import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { SizingRecipe, SizingRecipeDraft } from "@/lib/production/sizingRecipes";

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

export async function fetchSizingRecipes(companyId: string): Promise<SizingRecipe[]> {
  const response = await looseClient
    .from<SizingRecipe[]>("textile_sizing_recipes")
    .select("id, recipe_code, name, version, status, size_product_id, ingredients, parameters, notes, approved_at, created_at")
    .eq("company_id", companyId)
    .order("recipe_code", { ascending: true })
    .limit(300);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []).map((recipe) => ({
    ...recipe,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    parameters: recipe.parameters ?? {},
  }));
}

export async function createSizingRecipeDraft(draft: SizingRecipeDraft): Promise<SizingRecipe> {
  const { data, error } = await rpcClient.rpc("create_sizing_recipe_draft", {
    p_recipe_code: draft.recipeCode.trim(),
    p_name: draft.name.trim(),
    p_size_product_id: draft.sizeProductId,
    p_ingredients: draft.ingredients,
    p_parameters: draft.parameters,
    p_notes: draft.notes.trim() || null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as SizingRecipe;
}

export async function approveSizingRecipeVersion(recipeId: string): Promise<SizingRecipe> {
  const { data, error } = await rpcClient.rpc("approve_sizing_recipe_version", {
    p_recipe_id: recipeId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as SizingRecipe;
}
