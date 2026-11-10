import { describe, expect, it } from "vitest";
import {
  fiberClassificationIssue,
  fiberClassificationPayload,
  fiberReceiptIssue,
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

  // QA-UX r6: o dialogo precisa saber QUAL campo focar, nao so a mensagem.
  it("names the first invalid field without changing the message", () => {
    const empty = { ...baseReceipt, product_id: "" };
    expect(fiberReceiptIssue(empty)).toEqual({
      field: "product_id",
      message: "Selecione o produto de fibra/pluma recebido.",
    });
    expect(validateFiberReceipt(empty)).toBe(fiberReceiptIssue(empty)?.message);

    expect(fiberReceiptIssue({ ...baseReceipt, supplier_name: "" })?.field).toBe("supplier_name");
    expect(fiberReceiptIssue({ ...baseReceipt, lot_number: "" })?.field).toBe("lot_number");
    expect(fiberReceiptIssue({ ...baseReceipt, quantity_kg: 0 })?.field).toBe("quantity_kg");
    expect(fiberReceiptIssue({ ...baseReceipt, net_weight_kg: 990 })?.field).toBe("net_weight_kg");
    expect(fiberReceiptIssue(baseReceipt)).toBeNull();
  });

  it("names classification fields too", () => {
    expect(fiberClassificationIssue({ moisture_pct: 101 })?.field).toBe("moisture_pct");
    expect(fiberClassificationIssue({ trash_pct: -1 })?.field).toBe("trash_pct");
    expect(fiberClassificationIssue({ gross_weight_kg: 100, net_weight_kg: 101 })?.field).toBe("net_weight_kg");
    expect(fiberClassificationIssue({})).toBeNull();
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
