import { describe, expect, it } from "vitest";
import {
  externalStepCanComplete,
  summarizeOutsourcing,
  validateExternalReceive,
  validateExternalSend,
} from "./externalSteps";

describe("etapa externa / make-or-buy (T91)", () => {
  it("resume enviado, retornado, rejeitado e pendente de retorno", () => {
    expect(summarizeOutsourcing([
      { quantity_sent: 50, quantity_returned: 30, quantity_rejected: 5 },
      { quantity_sent: 20, quantity_returned: 0, quantity_rejected: 0 },
    ])).toEqual({ sent: 70, returned: 30, rejected: 5, outstanding: 35 });
  });

  it("envio exige fornecedor, quantidade positiva e teto da etapa", () => {
    const step = { quantityPending: 50, quantityProduced: 0, alreadySent: 20, alreadyReturned: 0 };
    expect(validateExternalSend({ supplierName: " ", quantity: 10, step })).toMatch(/fornecedor/);
    expect(validateExternalSend({ supplierName: "Terceiro", quantity: 31, step })).toMatch(/passa da quantidade/);
    expect(validateExternalSend({ supplierName: "Terceiro", quantity: 30, step })).toBeNull();
  });

  it("retorno não pode exceder o enviado", () => {
    expect(validateExternalReceive({ returned: 45, rejected: 10, alreadyReturned: 0, alreadyRejected: 0, sent: 50 }))
      .toMatch(/passa da quantidade enviada/);
    expect(validateExternalReceive({ returned: 40, rejected: 10, alreadyReturned: 0, alreadyRejected: 0, sent: 50 }))
      .toBeNull();
    expect(validateExternalReceive({ returned: 0, rejected: 0, alreadyReturned: 0, alreadyRejected: 0, sent: 50 }))
      .toMatch(/Informe/);
  });

  it("etapa externa só conclui com retorno bom cobrindo a boa apontada", () => {
    expect(externalStepCanComplete(50, 49)).toBe(false);
    expect(externalStepCanComplete(50, 50)).toBe(true);
  });
});
