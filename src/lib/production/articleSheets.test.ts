import { describe, expect, it } from "vitest";
import {
  describeArticleSheet,
  validateArticleSheetDraft,
  type ArticleSheetFields,
} from "./articleSheets";

const empty: ArticleSheetFields = {
  composition: null,
  construction: null,
  target_gsm: null,
  gsm_tolerance_pct: null,
  target_width_cm: null,
  width_tolerance_cm: null,
  warp_density_per_cm: null,
  weft_density_per_cm: null,
};

describe("ficha técnica do artigo versionada (T88)", () => {
  it("ficha sem nenhum dado de construção é rejeitada", () => {
    expect(validateArticleSheetDraft(empty)).toMatch(/ao menos um dado/);
  });

  it("tolerância sem o alvo correspondente é rejeitada", () => {
    expect(validateArticleSheetDraft({ ...empty, gsm_tolerance_pct: 3 })).toMatch(/gramatura alvo/);
    expect(validateArticleSheetDraft({ ...empty, width_tolerance_cm: 1 })).toMatch(/largura alvo/);
  });

  it("valores informados pela empresa são aceitos sem nada presumido", () => {
    expect(validateArticleSheetDraft({
      ...empty, composition: "Composição informada", target_gsm: 180, gsm_tolerance_pct: 3,
    })).toBeNull();
  });

  it("descreve só os campos informados", () => {
    expect(describeArticleSheet({ ...empty, target_gsm: 180, gsm_tolerance_pct: 3, target_width_cm: 160 }))
      .toBe("180 g/m² ±3% · 160 cm");
    expect(describeArticleSheet(empty)).toBe("");
  });
});
