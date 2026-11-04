import { describe, expect, it } from "vitest";
import {
  textileRouteTemplateSector,
  validateTextileRouteTemplateApplication,
  type TextileRouteTemplate,
} from "./textileRouteTemplates";

const template: TextileRouteTemplate = {
  key: "tecelagem_sem_engomagem",
  label: "Tecelagem sem engomagem",
  description: "Urdimento, preparação do tear e tecelagem",
  sector_kind: "tecelagem",
  sector_label: "Tecelagem",
  steps: [
    { sequence: 1, operation_key: "urdideira", name: "Urdideira", sector: "Tecelagem", sector_kind: "tecelagem" },
    { sequence: 2, operation_key: "preparacao_teares", name: "Preparação dos teares", sector: "Tecelagem", sector_kind: "tecelagem" },
    { sequence: 3, operation_key: "tecelagem_plana", name: "Tecelagem plana", sector: "Tecelagem", sector_kind: "tecelagem" },
  ],
};

describe("textile route template application", () => {
  it("requires product and known template", () => {
    expect(validateTextileRouteTemplateApplication({ productId: "", templateKey: template.key, templates: [template] })).toMatch(/produto/i);
    expect(validateTextileRouteTemplateApplication({ productId: "p1", templateKey: "desconhecido", templates: [template] })).toMatch(/não encontrado/i);
    expect(validateTextileRouteTemplateApplication({ productId: "p1", templateKey: template.key, templates: [template] })).toBeNull();
  });

  it("rejects a mixed-sector template because the OP sector comes from the route", () => {
    const mixed = {
      ...template,
      steps: [...template.steps, { sequence: 4, operation_key: "rama", name: "Rama", sector: "Beneficiamento/Acabamento", sector_kind: "beneficiamento" as const }],
    };
    expect(validateTextileRouteTemplateApplication({ productId: "p1", templateKey: template.key, templates: [mixed] })).toMatch(/setor/i);
  });

  it("exposes the first-step sector used by the PCP", () => {
    expect(textileRouteTemplateSector(template)).toBe("Tecelagem");
    expect(textileRouteTemplateSector(undefined)).toBeNull();
  });
});
