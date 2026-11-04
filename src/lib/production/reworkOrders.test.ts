import { describe, expect, it } from "vitest";
import { validateReworkDraft } from "./reworkOrders";

describe("rework order drafts", () => {
  it("accepts a rework within the lot balance with a reason", () => {
    expect(validateReworkDraft({
      originalOrderId: "op-1", quantity: 40, lotRemaining: 40, reason: "Cor rejeitada pelo laboratório",
    })).toBeNull();
  });

  it("requires original order, reason and quantity within the lot balance", () => {
    expect(validateReworkDraft({ originalOrderId: null, quantity: 10, lotRemaining: 40, reason: "x" })).toMatch(/original/i);
    expect(validateReworkDraft({ originalOrderId: "op-1", quantity: 10, lotRemaining: 40, reason: " " })).toMatch(/motivo/i);
    expect(validateReworkDraft({ originalOrderId: "op-1", quantity: 41, lotRemaining: 40, reason: "x" })).toMatch(/saldo/i);
  });
});
