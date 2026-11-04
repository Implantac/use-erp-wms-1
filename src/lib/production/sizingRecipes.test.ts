import { describe, expect, it } from "vitest";
import {
  describeSizingRecipeParameters,
  formatSizingRecipeLabel,
  validateSizingRecipeDraft,
  type SizingRecipeDraft,
} from "./sizingRecipes";

const emptyParameters = {
  concentration_pct: null,
  bath_temperature_c: null,
  speed_m_min: null,
  drying_temperature_c: null,
  warp_moisture_pct: null,
};

const validDraft: SizingRecipeDraft = {
  recipeCode: "ENG-01",
  name: "Receita padrão da empresa",
  sizeProductId: null,
  ingredients: [{ name: "Goma informada", quantity: 5, unit: "kg" }],
  parameters: { ...emptyParameters, concentration_pct: 8.5 },
  notes: "",
};

describe("sizing recipe drafts", () => {
  it("accepts a company recipe with only informed parameters", () => {
    expect(validateSizingRecipeDraft(validDraft)).toBeNull();
    expect(validateSizingRecipeDraft({ ...validDraft, parameters: emptyParameters })).toBeNull();
  });

  it("requires code, name and identified ingredients", () => {
    expect(validateSizingRecipeDraft({ ...validDraft, recipeCode: " " })).toMatch(/código/i);
    expect(validateSizingRecipeDraft({ ...validDraft, ingredients: [{ name: "", quantity: null, unit: "" }] }))
      .toMatch(/ingrediente/i);
  });

  it("rejects impossible parameter ranges", () => {
    expect(validateSizingRecipeDraft({
      ...validDraft,
      parameters: { ...emptyParameters, concentration_pct: 101 },
    })).toMatch(/concentração/i);
    expect(validateSizingRecipeDraft({
      ...validDraft,
      parameters: { ...emptyParameters, speed_m_min: -1 },
    })).toMatch(/velocidade/i);
  });

  it("formats the versioned label and only informed parameters", () => {
    expect(formatSizingRecipeLabel({ recipe_code: "ENG-01", name: "Padrão", version: 3 })).toBe("ENG-01 v3 — Padrão");
    expect(describeSizingRecipeParameters({ concentration_pct: 8.5, speed_m_min: 40 }))
      .toBe("concentração 8.5% · 40 m/min");
    expect(describeSizingRecipeParameters({})).toBeNull();
  });
});
