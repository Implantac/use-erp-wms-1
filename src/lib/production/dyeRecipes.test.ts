import { describe, expect, it } from "vitest";
import {
  describeDyeRecipeParameters,
  formatDyeRecipeLabel,
  validateDyeRecipeDraft,
  type DyeRecipeDraft,
} from "./dyeRecipes";

const emptyParameters = {
  bath_ratio: null,
  dyeing_temperature_c: null,
  dyeing_time_min: null,
  ph_target: null,
};

const validDraft: DyeRecipeDraft = {
  recipeCode: "TING-01",
  name: "Receita da empresa",
  ingredients: [{ name: "Corante informado", quantity: 2, unit: "%" }],
  parameters: { ...emptyParameters, bath_ratio: 8 },
  notes: "",
};

describe("dye recipe drafts", () => {
  it("accepts a company recipe with only informed parameters", () => {
    expect(validateDyeRecipeDraft(validDraft)).toBeNull();
    expect(validateDyeRecipeDraft({ ...validDraft, parameters: emptyParameters })).toBeNull();
  });

  it("requires code, name and identified dyes/auxiliaries", () => {
    expect(validateDyeRecipeDraft({ ...validDraft, recipeCode: " " })).toMatch(/código/i);
    expect(validateDyeRecipeDraft({ ...validDraft, ingredients: [{ name: "", quantity: null, unit: "" }] }))
      .toMatch(/corante/i);
  });

  it("rejects impossible ranges including pH outside 0-14", () => {
    expect(validateDyeRecipeDraft({ ...validDraft, parameters: { ...emptyParameters, ph_target: 15 } })).toMatch(/pH/i);
    expect(validateDyeRecipeDraft({ ...validDraft, parameters: { ...emptyParameters, dyeing_time_min: -5 } })).toMatch(/tempo/i);
  });

  it("formats the versioned label and only informed parameters", () => {
    expect(formatDyeRecipeLabel({ recipe_code: "TING-01", name: "Azul", version: 2 })).toBe("TING-01 v2 — Azul");
    expect(describeDyeRecipeParameters({ bath_ratio: 8, dyeing_temperature_c: 95 })).toBe("banho 1:8 · 95 °C");
    expect(describeDyeRecipeParameters({})).toBeNull();
  });
});
