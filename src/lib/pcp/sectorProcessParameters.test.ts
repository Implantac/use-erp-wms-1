import { describe, expect, it } from "vitest";
import {
  dyeingCompletionBlocked,
  formatBlendComponents,
  validateBlendComponents,
  validateDyeingMachineLoad,
  validateLabDecision,
  validatePhTarget,
  validatePretreatment,
} from "./sectorProcessParameters";

describe("spinning blend", () => {
  it("accepts a company blend within 100%", () => {
    expect(validateBlendComponents([
      { name: "Algodão", pct: 70 },
      { name: "Poliéster", pct: 30 },
    ])).toBeNull();
    expect(formatBlendComponents([{ name: "Algodão", pct: 70 }])).toBe("Algodão 70%");
  });

  it("rejects unnamed components and totals above 100%", () => {
    expect(validateBlendComponents([{ name: "", pct: 10 }])).toMatch(/nome/i);
    expect(validateBlendComponents([
      { name: "Algodão", pct: 80 },
      { name: "Poliéster", pct: 30 },
    ])).toMatch(/100%/i);
  });
});

describe("dyeing pretreatment and pH", () => {
  it("requires identification only when pretreatment applies", () => {
    expect(validatePretreatment({ applicable: false, type: "", recipeCode: "", temperatureC: null, timeMin: null })).toBeNull();
    expect(validatePretreatment({ applicable: true, type: "", recipeCode: "", temperatureC: null, timeMin: null })).toMatch(/pré-tratamento/i);
    expect(validatePretreatment({ applicable: true, type: "Desengomagem da empresa", recipeCode: "", temperatureC: 90, timeMin: 30 })).toBeNull();
  });

  it("validates the pH scale without presuming a target", () => {
    expect(validatePhTarget(null)).toBeNull();
    expect(validatePhTarget(7)).toBeNull();
    expect(validatePhTarget(15)).toMatch(/pH/i);
  });
});

describe("dyeing machine load", () => {
  const limits = { minLoadKg: 50, maxLoadKg: 100, usefulBathVolumeL: 800 };

  it("accepts a batch inside the configured load and bath volume", () => {
    expect(validateDyeingMachineLoad({ plannedKg: 80, bathRatio: 8, ...limits })).toBeNull();
  });

  it("rejects batches outside the configured load or above the useful volume", () => {
    expect(validateDyeingMachineLoad({ plannedKg: 30, bathRatio: 8, ...limits })).toMatch(/mínima/i);
    expect(validateDyeingMachineLoad({ plannedKg: 120, bathRatio: 8, ...limits })).toMatch(/máxima/i);
    expect(validateDyeingMachineLoad({ plannedKg: 80, bathRatio: 20, ...limits })).toMatch(/volume/i);
  });

  it("validates nothing when the company configured no limit", () => {
    expect(validateDyeingMachineLoad({
      plannedKg: 500, bathRatio: 20, minLoadKg: null, maxLoadKg: null, usefulBathVolumeL: null,
    })).toBeNull();
  });
});

describe("dyeing lab approval gate", () => {
  it("blocks completion only when approval is required and undecided/rejected", () => {
    expect(dyeingCompletionBlocked({ labApprovalRequired: false, labDecision: "pending" })).toBe(false);
    expect(dyeingCompletionBlocked({ labApprovalRequired: true, labDecision: "pending" })).toBe(true);
    expect(dyeingCompletionBlocked({ labApprovalRequired: true, labDecision: "rejected" })).toBe(true);
    expect(dyeingCompletionBlocked({ labApprovalRequired: true, labDecision: "approved" })).toBe(false);
    expect(dyeingCompletionBlocked({ labApprovalRequired: true, labDecision: "concession" })).toBe(false);
  });

  it("requires justification for a concession release", () => {
    expect(validateLabDecision("concession", "")).toMatch(/concessão/i);
    expect(validateLabDecision("concession", "desvio aceito pelo cliente")).toBeNull();
    expect(validateLabDecision("approved", "")).toBeNull();
    expect(validateLabDecision("inventada", "")).toMatch(/inválida/i);
  });
});
