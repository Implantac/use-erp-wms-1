import { describe, expect, it } from "vitest";
import {
  formatStockLotUnitMeasures,
  validateStockLotUnitDrafts,
  validateUnitAllocationSelection,
  type StockLotUnitDraft,
} from "./stockLotUnits";

const draft = (patch: Partial<StockLotUnitDraft> = {}): StockLotUnitDraft => ({
  unit_code: "ROLO-001",
  unit_type: "roll",
  quantity: 100,
  length_m: 100,
  width_cm: 150,
  weight_kg: 42,
  ...patch,
});

describe("stock lot unit drafts", () => {
  it("accepts rolls whose sum fits the physical lot", () => {
    expect(validateStockLotUnitDrafts([draft(), draft({ unit_code: "ROLO-002", quantity: 80 })], 0, 200)).toBeNull();
  });

  it("rejects duplicate labels and quantities above the lot", () => {
    expect(validateStockLotUnitDrafts([draft(), draft()], 0, 500)).toMatch(/repetido/i);
    expect(validateStockLotUnitDrafts([draft({ quantity: 120 })], 100, 200)).toMatch(/não pode passar/i);
  });

  it("rejects missing code and invalid quantity", () => {
    expect(validateStockLotUnitDrafts([draft({ unit_code: " " })], 0, 200)).toMatch(/código/i);
    expect(validateStockLotUnitDrafts([draft({ quantity: 0 })], 0, 200)).toMatch(/quantidade/i);
  });

  it("formats only informed physical measures", () => {
    expect(formatStockLotUnitMeasures({ length_m: 100, width_cm: null, weight_kg: 42 })).toBe("100 m · 42 kg");
    expect(formatStockLotUnitMeasures({ length_m: null, width_cm: null, weight_kg: null })).toBeNull();
  });
});

describe("unit allocation to an order", () => {
  const packed = {
    unit_code: "ROLO-001",
    lot_id: "lot-1",
    quantity: 60,
    status: "packed" as const,
    quality_status: "approved" as const,
  };

  it("accepts approved packed rolls within the reserved lot quantity", () => {
    expect(validateUnitAllocationSelection([packed], [{ lot_id: "lot-1", capacity: 100, allocated: 20 }])).toBeNull();
  });

  it("rejects unpacked/unapproved rolls and quantities above the reservation", () => {
    expect(validateUnitAllocationSelection([{ ...packed, status: "available" }], [{ lot_id: "lot-1", capacity: 100, allocated: 0 }])).toMatch(/embalado/i);
    expect(validateUnitAllocationSelection([{ ...packed, quality_status: "pending" }], [{ lot_id: "lot-1", capacity: 100, allocated: 0 }])).toMatch(/aprovado/i);
    expect(validateUnitAllocationSelection([packed], [{ lot_id: "lot-1", capacity: 100, allocated: 50 }])).toMatch(/excedem/i);
  });
});
