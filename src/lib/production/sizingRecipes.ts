export type SizingRecipeStatus = "draft" | "approved" | "superseded" | "inactive";

export interface SizingIngredient {
  name: string;
  quantity: number | null;
  unit: string;
}

export interface SizingRecipeParameters {
  concentration_pct: number | null;
  bath_temperature_c: number | null;
  speed_m_min: number | null;
  drying_temperature_c: number | null;
  warp_moisture_pct: number | null;
}

export interface SizingRecipe {
  id: string;
  recipe_code: string;
  name: string;
  version: number;
  status: SizingRecipeStatus;
  size_product_id: string | null;
  ingredients: SizingIngredient[];
  parameters: Partial<SizingRecipeParameters>;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface SizingRecipeDraft {
  recipeCode: string;
  name: string;
  sizeProductId: string | null;
  ingredients: SizingIngredient[];
  parameters: SizingRecipeParameters;
  notes: string;
}

const numericParameterRules: Array<{
  key: keyof SizingRecipeParameters;
  label: string;
  max?: number;
}> = [
  { key: "concentration_pct", label: "concentração", max: 100 },
  { key: "bath_temperature_c", label: "temperatura do banho" },
  { key: "speed_m_min", label: "velocidade" },
  { key: "drying_temperature_c", label: "temperatura de secagem" },
  { key: "warp_moisture_pct", label: "umidade do urdume", max: 100 },
];

/**
 * Receita de engomagem é sempre da empresa: código e nome obrigatórios,
 * ingredientes identificados e parâmetros apenas quando informados.
 */
export function validateSizingRecipeDraft(draft: SizingRecipeDraft): string | null {
  if (!draft.recipeCode.trim()) return "Informe o código da receita de engomagem.";
  if (!draft.name.trim()) return "Informe o nome da receita de engomagem.";
  for (const ingredient of draft.ingredients) {
    if (!ingredient.name.trim()) return "Todo ingrediente da receita precisa de nome.";
    if (ingredient.quantity !== null && (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0)) {
      return `A quantidade de ${ingredient.name} não pode ser negativa.`;
    }
  }
  for (const rule of numericParameterRules) {
    const value = draft.parameters[rule.key];
    if (value === null || value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) return `O parâmetro ${rule.label} não pode ser negativo.`;
    if (rule.max !== undefined && value > rule.max) return `O parâmetro ${rule.label} não pode passar de ${rule.max}.`;
  }
  return null;
}

export function formatSizingRecipeLabel(recipe: Pick<SizingRecipe, "recipe_code" | "name" | "version">): string {
  return `${recipe.recipe_code} v${recipe.version} — ${recipe.name}`;
}

export function describeSizingRecipeParameters(
  parameters: Partial<SizingRecipeParameters> | null | undefined,
): string | null {
  if (!parameters) return null;
  const parts: string[] = [];
  if (typeof parameters.concentration_pct === "number") parts.push(`concentração ${parameters.concentration_pct}%`);
  if (typeof parameters.bath_temperature_c === "number") parts.push(`banho ${parameters.bath_temperature_c} °C`);
  if (typeof parameters.speed_m_min === "number") parts.push(`${parameters.speed_m_min} m/min`);
  if (typeof parameters.drying_temperature_c === "number") parts.push(`secagem ${parameters.drying_temperature_c} °C`);
  if (typeof parameters.warp_moisture_pct === "number") parts.push(`umidade ${parameters.warp_moisture_pct}%`);
  return parts.length ? parts.join(" · ") : null;
}
