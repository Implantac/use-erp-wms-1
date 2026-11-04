export interface ExternalStepProgress {
  quantityPending: number;
  quantityProduced: number;
  alreadySent: number;
  alreadyReturned: number;
}

/**
 * Totais de um envio a fornecedor: enviado, retornado bom, rejeitado no
 * fornecedor e o que ainda falta voltar. Tudo de registros reais.
 */
export function summarizeOutsourcing(sends: Array<{
  quantity_sent: number;
  quantity_returned: number | null;
  quantity_rejected: number | null;
}>): { sent: number; returned: number; rejected: number; outstanding: number } {
  const sent = sends.reduce((sum, send) => sum + (Number(send.quantity_sent) || 0), 0);
  const returned = sends.reduce((sum, send) => sum + (Number(send.quantity_returned) || 0), 0);
  const rejected = sends.reduce((sum, send) => sum + (Number(send.quantity_rejected) || 0), 0);
  return { sent, returned, rejected, outstanding: Math.max(0, sent - returned - rejected) };
}

/** Envio só até a quantidade da etapa e sempre com fornecedor informado. */
export function validateExternalSend(input: {
  supplierName: string;
  quantity: number | null;
  step: ExternalStepProgress;
}): string | null {
  if (!input.supplierName.trim()) return "Informe o fornecedor do envio.";
  if (input.quantity === null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Informe a quantidade enviada.";
  }
  const stepTotal = input.step.quantityPending + input.step.quantityProduced;
  if (input.step.alreadySent + input.quantity > stepTotal + 0.0005) {
    return `Quantidade enviada passa da quantidade da etapa (${stepTotal}).`;
  }
  return null;
}

/** Retorno nunca excede o enviado; rejeitado no fornecedor não volta como bom. */
export function validateExternalReceive(input: {
  returned: number | null;
  rejected: number | null;
  alreadyReturned: number;
  alreadyRejected: number;
  sent: number;
}): string | null {
  const returned = input.returned ?? 0;
  const rejected = input.rejected ?? 0;
  if ((!Number.isFinite(returned) || returned < 0) || (!Number.isFinite(rejected) || rejected < 0)) {
    return "Quantidades do retorno devem ser não negativas.";
  }
  if (returned === 0 && rejected === 0) return "Informe a quantidade retornada e/ou rejeitada.";
  if (input.alreadyReturned + returned + input.alreadyRejected + rejected > input.sent + 0.0005) {
    return `Retorno passa da quantidade enviada (${input.sent}).`;
  }
  return null;
}

/** A etapa externa só conclui quando o retorno bom cobre a boa apontada. */
export function externalStepCanComplete(producedQuantity: number, returnedQuantity: number): boolean {
  return returnedQuantity + 0.0005 >= producedQuantity;
}
