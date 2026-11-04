import type { SectorKind } from "@/lib/pcp/sectorProfiles";

export interface TextileRouteTemplateStep {
  sequence: number;
  operation_key: string;
  name: string;
  sector: string;
  sector_kind: SectorKind;
}

export interface TextileRouteTemplate {
  key: string;
  label: string;
  description: string;
  sector_kind: SectorKind;
  sector_label: string;
  steps: TextileRouteTemplateStep[];
}

export function validateTextileRouteTemplateApplication(input: {
  productId: string;
  templateKey: string;
  templates: readonly TextileRouteTemplate[];
}): string | null {
  if (!input.productId) return "Selecione o produto que receberá o roteiro.";
  if (!input.templateKey) return "Selecione um modelo de roteiro têxtil.";
  const template = input.templates.find((item) => item.key === input.templateKey);
  if (!template) return "Modelo de roteiro não encontrado. Recarregue a lista de modelos.";
  if (template.steps.length === 0) return "O modelo selecionado está sem etapas.";
  const sequences = template.steps.map((step) => step.sequence);
  if (new Set(sequences).size !== sequences.length) return "O modelo possui sequências repetidas.";
  if (template.steps.some((step) => step.sector_kind !== template.sector_kind)) {
    return "Todas as etapas deste modelo devem pertencer ao setor do modelo para a OP cair na central correta.";
  }
  return null;
}

export function textileRouteTemplateSector(template: TextileRouteTemplate | undefined): string | null {
  if (!template || template.steps.length === 0) return null;
  return template.steps[0].sector;
}
