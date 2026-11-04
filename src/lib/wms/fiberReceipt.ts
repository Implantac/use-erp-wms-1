/**
 * Recebimento estruturado de fibra/pluma.
 *
 * A classificação é sempre a informada pela empresa (balança/laudo).
 * Campo vazio significa "não informado" — nunca estimamos umidade,
 * micronaire, comprimento, resistência ou impurezas.
 */

export interface FiberClassification {
  bale_count?: number | null;
  gross_weight_kg?: number | null;
  net_weight_kg?: number | null;
  moisture_pct?: number | null;
  micronaire?: number | null;
  staple_length_mm?: number | null;
  strength_g_tex?: number | null;
  trash_pct?: number | null;
  color_grade?: string | null;
  classification_grade?: string | null;
  notes?: string | null;
}

export interface FiberReceiptFormValues extends FiberClassification {
  product_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  lot_number: string;
  quantity_kg: number | null;
  location: string;
  origin_reference: string;
  unit_cost?: number | null;
}

function present(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateFiberClassification(values: FiberClassification): string | null {
  if (present(values.bale_count) && (!Number.isInteger(values.bale_count) || values.bale_count < 0)) {
    return "A quantidade de fardos deve ser um número inteiro maior ou igual a zero.";
  }
  if (present(values.gross_weight_kg) && values.gross_weight_kg < 0) return "O peso bruto não pode ser negativo.";
  if (present(values.net_weight_kg) && values.net_weight_kg < 0) return "O peso líquido não pode ser negativo.";
  if (present(values.gross_weight_kg) && present(values.net_weight_kg) && values.net_weight_kg > values.gross_weight_kg) {
    return "O peso líquido não pode ser maior que o peso bruto.";
  }
  if (present(values.moisture_pct) && (values.moisture_pct < 0 || values.moisture_pct > 100)) {
    return "A umidade deve ficar entre 0% e 100%.";
  }
  if (present(values.micronaire) && values.micronaire < 0) return "O micronaire não pode ser negativo.";
  if (present(values.staple_length_mm) && values.staple_length_mm < 0) return "O comprimento da fibra não pode ser negativo.";
  if (present(values.strength_g_tex) && values.strength_g_tex < 0) return "A resistência da fibra não pode ser negativa.";
  if (present(values.trash_pct) && (values.trash_pct < 0 || values.trash_pct > 100)) {
    return "O teor de impurezas deve ficar entre 0% e 100%.";
  }
  return null;
}

export function validateFiberReceipt(values: FiberReceiptFormValues): string | null {
  if (!values.product_id) return "Selecione o produto de fibra/pluma recebido.";
  if (!values.supplier_name.trim() && !values.supplier_id) return "Informe o fornecedor do lote.";
  if (!values.lot_number.trim()) return "Informe o número do lote do fornecedor.";
  if (!present(values.quantity_kg) || values.quantity_kg <= 0) return "Informe o peso recebido em kg.";
  if (present(values.net_weight_kg) && Math.abs(values.net_weight_kg - values.quantity_kg) > 0.001) {
    return "O peso líquido deve ser igual ao peso que entrará no estoque.";
  }
  return validateFiberClassification(values);
}

export function fiberClassificationPayload(values: FiberClassification): FiberClassification {
  const text = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    bale_count: values.bale_count ?? null,
    gross_weight_kg: values.gross_weight_kg ?? null,
    net_weight_kg: values.net_weight_kg ?? null,
    moisture_pct: values.moisture_pct ?? null,
    micronaire: values.micronaire ?? null,
    staple_length_mm: values.staple_length_mm ?? null,
    strength_g_tex: values.strength_g_tex ?? null,
    trash_pct: values.trash_pct ?? null,
    color_grade: text(values.color_grade),
    classification_grade: text(values.classification_grade),
    notes: text(values.notes),
  };
}

export function hasFiberClassification(values: FiberClassification | null | undefined): boolean {
  if (!values) return false;
  return Object.values(fiberClassificationPayload(values)).some((value) => value !== null && value !== "");
}

export function formatFiberClassificationSummary(values: FiberClassification | null | undefined): string | null {
  if (!hasFiberClassification(values)) return null;
  const c = values as FiberClassification;
  const parts: string[] = [];
  if (present(c.bale_count)) parts.push(`${c.bale_count} fardo(s)`);
  if (present(c.moisture_pct)) parts.push(`umidade ${c.moisture_pct}%`);
  if (present(c.micronaire)) parts.push(`micronaire ${c.micronaire}`);
  if (present(c.staple_length_mm)) parts.push(`${c.staple_length_mm} mm`);
  if (present(c.strength_g_tex)) parts.push(`${c.strength_g_tex} gf/tex`);
  if (present(c.trash_pct)) parts.push(`impurezas ${c.trash_pct}%`);
  if (c.classification_grade?.trim()) parts.push(`classe ${c.classification_grade.trim()}`);
  if (c.color_grade?.trim()) parts.push(`cor ${c.color_grade.trim()}`);
  return parts.length ? parts.join(" · ") : "Classificação registrada";
}
