import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { DyeRecipe, DyeRecipeDraft } from "@/lib/production/dyeRecipes";

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

export async function fetchDyeRecipes(companyId: string): Promise<DyeRecipe[]> {
  const response = await looseClient
    .from<DyeRecipe[]>("textile_dye_recipes")
    .select("id, recipe_code, name, version, status, ingredients, parameters, notes, approved_at, created_at")
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

export async function createDyeRecipeDraft(draft: DyeRecipeDraft): Promise<DyeRecipe> {
  const { data, error } = await rpcClient.rpc("create_dye_recipe_draft", {
    p_recipe_code: draft.recipeCode.trim(),
    p_name: draft.name.trim(),
    p_ingredients: draft.ingredients,
    p_parameters: draft.parameters,
    p_notes: draft.notes.trim() || null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as DyeRecipe;
}

export async function approveDyeRecipeVersion(recipeId: string): Promise<DyeRecipe> {
  const { data, error } = await rpcClient.rpc("approve_dye_recipe_version", {
    p_recipe_id: recipeId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as DyeRecipe;
}

export async function setDyeingRecipeVersion(productionOrderId: string, recipeId: string | null) {
  const { data, error } = await rpcClient.rpc("set_dyeing_recipe_version", {
    p_production_order_id: productionOrderId,
    p_recipe_id: recipeId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Record<string, unknown>;
}
