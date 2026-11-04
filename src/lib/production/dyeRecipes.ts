export type DyeRecipeStatus = "draft" | "approved" | "superseded" | "inactive";

export interface DyeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
}

export interface DyeRecipeParameters {
  bath_ratio: number | null;
  dyeing_temperature_c: number | null;
  dyeing_time_min: number | null;
  ph_target: number | null;
}

export interface DyeRecipe {
  id: string;
  recipe_code: string;
  name: string;
  version: number;
  status: DyeRecipeStatus;
  ingredients: DyeIngredient[];
  parameters: Partial<DyeRecipeParameters>;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface DyeRecipeDraft {
  recipeCode: string;
  name: string;
  ingredients: DyeIngredient[];
  parameters: DyeRecipeParameters;
  notes: string;
}

/**
 * Receita de tingimento é sempre da empresa e validada por ela: código e
 * nome obrigatórios, ingredientes identificados e parâmetros apenas
 * quando informados — nenhuma dosagem é presumida.
 */
export function validateDyeRecipeDraft(draft: DyeRecipeDraft): string | null {
  if (!draft.recipeCode.trim()) return "Informe o código da receita de tingimento.";
  if (!draft.name.trim()) return "Informe o nome da receita de tingimento.";
  for (const ingredient of draft.ingredients) {
    if (!ingredient.name.trim()) return "Todo corante/auxiliar da receita precisa de nome.";
    if (ingredient.quantity !== null && (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0)) {
      return `A quantidade de ${ingredient.name} não pode ser negativa.`;
    }
  }
  const p = draft.parameters;
  if (p.bath_ratio !== null && (!Number.isFinite(p.bath_ratio) || p.bath_ratio < 0)) {
    return "A relação de banho não pode ser negativa.";
  }
  if (p.dyeing_temperature_c !== null && (!Number.isFinite(p.dyeing_temperature_c) || p.dyeing_temperature_c < 0)) {
    return "A temperatura do tingimento não pode ser negativa.";
  }
  if (p.dyeing_time_min !== null && (!Number.isFinite(p.dyeing_time_min) || p.dyeing_time_min < 0)) {
    return "O tempo do tingimento não pode ser negativo.";
  }
  if (p.ph_target !== null && (!Number.isFinite(p.ph_target) || p.ph_target < 0 || p.ph_target > 14)) {
    return "O pH alvo deve ficar entre 0 e 14.";
  }
  return null;
}

export function formatDyeRecipeLabel(recipe: Pick<DyeRecipe, "recipe_code" | "name" | "version">): string {
  return `${recipe.recipe_code} v${recipe.version} — ${recipe.name}`;
}

export function describeDyeRecipeParameters(
  parameters: Partial<DyeRecipeParameters> | null | undefined,
): string | null {
  if (!parameters) return null;
  const parts: string[] = [];
  if (typeof parameters.bath_ratio === "number") parts.push(`banho 1:${parameters.bath_ratio}`);
  if (typeof parameters.dyeing_temperature_c === "number") parts.push(`${parameters.dyeing_temperature_c} °C`);
  if (typeof parameters.dyeing_time_min === "number") parts.push(`${parameters.dyeing_time_min} min`);
  if (typeof parameters.ph_target === "number") parts.push(`pH ${parameters.ph_target}`);
  return parts.length ? parts.join(" · ") : null;
}
