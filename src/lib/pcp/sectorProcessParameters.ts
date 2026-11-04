export interface BlendComponent {
  name: string;
  pct: number | null;
}

export interface PretreatmentInput {
  applicable: boolean | null;
  type: string;
  recipeCode: string;
  temperatureC: number | null;
  timeMin: number | null;
}

/**
 * Mistura da fiação é configurada pela empresa: componentes identificados,
 * percentuais válidos e soma nunca acima de 100%.
 */
export function validateBlendComponents(components: readonly BlendComponent[]): string | null {
  let total = 0;
  for (const component of components) {
    if (!component.name.trim()) return "Todo componente da mistura precisa de nome.";
    if (component.pct !== null) {
      if (!Number.isFinite(component.pct) || component.pct < 0 || component.pct > 100) {
        return `O percentual de ${component.name} deve ficar entre 0 e 100.`;
      }
      total += component.pct;
    }
  }
  if (total > 100.0005) return "A soma dos percentuais da mistura não pode passar de 100%.";
  return null;
}

export function formatBlendComponents(components: readonly BlendComponent[]): string | null {
  if (components.length === 0) return null;
  return components
    .map((component) => `${component.name}${component.pct !== null ? ` ${component.pct}%` : ""}`)
    .join(" · ");
}

/**
 * Pré-tratamento só é exigido quando a empresa marca como aplicável; nesse
 * caso ele precisa ser identificado (tipo ou receita da empresa).
 */
export function validatePretreatment(input: PretreatmentInput): string | null {
  if (input.applicable === true && !input.type.trim() && !input.recipeCode.trim()) {
    return "Pré-tratamento aplicável exige o tipo ou a receita da empresa.";
  }
  if (input.temperatureC !== null && (!Number.isFinite(input.temperatureC) || input.temperatureC < 0)) {
    return "A temperatura do pré-tratamento não pode ser negativa.";
  }
  if (input.timeMin !== null && (!Number.isFinite(input.timeMin) || input.timeMin < 0)) {
    return "O tempo do pré-tratamento não pode ser negativo.";
  }
  return null;
}

export function validatePhTarget(ph: number | null): string | null {
  if (ph === null) return null;
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) return "O pH alvo deve ficar entre 0 e 14.";
  return null;
}

export interface DyeingMachineLoadInput {
  plannedKg: number | null;
  bathRatio: number | null;
  minLoadKg: number | null | undefined;
  maxLoadKg: number | null | undefined;
  usefulBathVolumeL: number | null | undefined;
}

/**
 * Carga da partida contra os limites que a empresa configurou na máquina.
 * Limite não configurado não valida nada — nunca se presume capacidade.
 */
export function validateDyeingMachineLoad(input: DyeingMachineLoadInput): string | null {
  const { plannedKg, bathRatio, minLoadKg, maxLoadKg, usefulBathVolumeL } = input;
  if (plannedKg !== null) {
    if (minLoadKg !== null && minLoadKg !== undefined && plannedKg < minLoadKg) {
      return `Partida de ${plannedKg} kg está abaixo da carga mínima configurada da máquina (${minLoadKg} kg).`;
    }
    if (maxLoadKg !== null && maxLoadKg !== undefined && plannedKg > maxLoadKg) {
      return `Partida de ${plannedKg} kg excede a carga máxima configurada da máquina (${maxLoadKg} kg).`;
    }
  }
  if (usefulBathVolumeL !== null && usefulBathVolumeL !== undefined && plannedKg !== null && bathRatio !== null) {
    const volume = plannedKg * bathRatio;
    if (volume > usefulBathVolumeL) {
      return `Volume do banho de ${volume} L (peso × relação de banho) excede o volume útil configurado da máquina (${usefulBathVolumeL} L).`;
    }
  }
  return null;
}

export type LabDecision = "pending" | "approved" | "rejected" | "concession";

/**
 * Decisão do laboratório sobre a cor da partida. Concessão (liberar com
 * desvio) sempre exige justificativa registrada; as demais não presumem
 * tolerância alguma da empresa.
 */
export function validateLabDecision(decision: string, notes: string): string | null {
  if (!["pending", "approved", "rejected", "concession"].includes(decision)) {
    return "Decisão do laboratório inválida.";
  }
  if (decision === "concession" && !notes.trim()) {
    return "Liberação sob concessão exige a justificativa registrada.";
  }
  return null;
}

/** A conclusão só é bloqueada quando a empresa marcou a aprovação como exigida. */
export function dyeingCompletionBlocked(input: {
  labApprovalRequired: boolean | null | undefined;
  labDecision: string | null | undefined;
}): boolean {
  if (!input.labApprovalRequired) return false;
  return input.labDecision !== "approved" && input.labDecision !== "concession";
}
