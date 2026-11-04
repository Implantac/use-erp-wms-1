export type ArticleSheetStatus = "draft" | "approved" | "superseded" | "inactive";

export interface ArticleSheetFields {
  composition: string | null;
  construction: string | null;
  target_gsm: number | null;
  gsm_tolerance_pct: number | null;
  target_width_cm: number | null;
  width_tolerance_cm: number | null;
  warp_density_per_cm: number | null;
  weft_density_per_cm: number | null;
}

export interface ArticleSheet extends ArticleSheetFields {
  id: string;
  product_id: string;
  version: number;
  status: ArticleSheetStatus;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

export const ARTICLE_SHEET_STATUS_LABELS: Record<ArticleSheetStatus, string> = {
  draft: "Rascunho",
  approved: "Aprovada",
  superseded: "Substituída",
  inactive: "Inativa",
};

/**
 * A ficha formal do artigo só carrega o que a empresa informou: ao menos um
 * dado de construção é exigido, tolerância só existe com o alvo dela e
 * nenhum valor é sugerido ou presumido.
 */
export function validateArticleSheetDraft(fields: ArticleSheetFields): string | null {
  if (fields.gsm_tolerance_pct !== null && fields.target_gsm === null) {
    return "Tolerância de gramatura exige a gramatura alvo.";
  }
  if (fields.width_tolerance_cm !== null && fields.target_width_cm === null) {
    return "Tolerância de largura exige a largura alvo.";
  }
  const hasConstruction = Boolean(
    fields.composition?.trim() || fields.construction?.trim()
    || fields.target_gsm !== null || fields.target_width_cm !== null
    || fields.warp_density_per_cm !== null || fields.weft_density_per_cm !== null,
  );
  if (!hasConstruction) {
    return "Informe ao menos um dado de construção (composição, construção, gramatura, largura ou densidades).";
  }
  const positives: Array<[number | null, string]> = [
    [fields.target_gsm, "Gramatura alvo"],
    [fields.target_width_cm, "Largura alvo"],
    [fields.warp_density_per_cm, "Densidade de urdume"],
    [fields.weft_density_per_cm, "Densidade de trama"],
  ];
  for (const [value, label] of positives) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return `${label} deve ser positiva.`;
  }
  if (fields.gsm_tolerance_pct !== null
    && (!Number.isFinite(fields.gsm_tolerance_pct) || fields.gsm_tolerance_pct < 0 || fields.gsm_tolerance_pct > 100)) {
    return "Tolerância de gramatura deve ficar entre 0 e 100.";
  }
  if (fields.width_tolerance_cm !== null
    && (!Number.isFinite(fields.width_tolerance_cm) || fields.width_tolerance_cm < 0)) {
    return "Tolerância de largura não pode ser negativa.";
  }
  return null;
}

/** Resumo curto da construção/tolerâncias informadas (só o que existe). */
export function describeArticleSheet(sheet: ArticleSheetFields): string {
  const parts: string[] = [];
  if (sheet.composition?.trim()) parts.push(sheet.composition.trim());
  if (sheet.construction?.trim()) parts.push(sheet.construction.trim());
  if (sheet.target_gsm !== null) {
    parts.push(sheet.gsm_tolerance_pct !== null
      ? `${sheet.target_gsm} g/m² ±${sheet.gsm_tolerance_pct}%`
      : `${sheet.target_gsm} g/m²`);
  }
  if (sheet.target_width_cm !== null) {
    parts.push(sheet.width_tolerance_cm !== null
      ? `${sheet.target_width_cm} cm ±${sheet.width_tolerance_cm} cm`
      : `${sheet.target_width_cm} cm`);
  }
  if (sheet.warp_density_per_cm !== null) parts.push(`urdume ${sheet.warp_density_per_cm}/cm`);
  if (sheet.weft_density_per_cm !== null) parts.push(`trama ${sheet.weft_density_per_cm}/cm`);
  return parts.join(" · ");
}
