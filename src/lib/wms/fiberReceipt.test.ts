import { describe, expect, it } from "vitest";
import {
  fiberClassificationPayload,
  formatFiberClassificationSummary,
  validateFiberClassification,
  validateFiberReceipt,
} from "./fiberReceipt";

const baseReceipt = {
  product_id: "product-1",
  supplier_name: "Fornecedor Algodão",
  lot_number: "PLUMA-001",
  quantity_kg: 1_000,
  location: "A-01",
  origin_reference: "NF-e 123",
};

describe("fiber receipt validation", () => {
  it("accepts a receipt with only the mandatory receiving data", () => {
    expect(validateFiberReceipt(baseReceipt)).toBeNull();
  });

  it("requires supplier, lot and positive weight", () => {
    expect(validateFiberReceipt({ ...baseReceipt, supplier_name: "" })).toMatch(/fornecedor/i);
    expect(validateFiberReceipt({ ...baseReceipt, lot_number: "" })).toMatch(/lote/i);
    expect(validateFiberReceipt({ ...baseReceipt, quantity_kg: 0 })).toMatch(/peso/i);
  });

  it("requires the stocked weight to be the informed net weight", () => {
    expect(validateFiberReceipt({ ...baseReceipt, net_weight_kg: 990 })).toMatch(/peso líquido/i);
    expect(validateFiberReceipt({ ...baseReceipt, net_weight_kg: 1_000, gross_weight_kg: 1_025 })).toBeNull();
  });

  it("rejects impossible classification ranges without inventing values", () => {
    expect(validateFiberClassification({ moisture_pct: 101 })).toMatch(/umidade/i);
    expect(validateFiberClassification({ trash_pct: -1 })).toMatch(/impurezas/i);
    expect(validateFiberClassification({ gross_weight_kg: 100, net_weight_kg: 101 })).toMatch(/líquido/i);
  });
});

describe("fiber classification payload and summary", () => {
  it("turns blanks into null so missing lab data stays missing", () => {
    expect(fiberClassificationPayload({ color_grade: "  ", moisture_pct: null })).toMatchObject({
      color_grade: null,
      moisture_pct: null,
    });
  });

  it("summarizes only informed measurements", () => {
    expect(formatFiberClassificationSummary({ bale_count: 4, moisture_pct: 8.2, micronaire: 4.1 }))
      .toBe("4 fardo(s) · umidade 8.2% · micronaire 4.1");
    expect(formatFiberClassificationSummary({})).toBeNull();
  });
});
