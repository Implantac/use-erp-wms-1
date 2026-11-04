import { describe, expect, it } from "vitest";
import { colorSequenceViolation, normalizeColorSequencingRule } from "./colorSequencing";

describe("sequenciamento formal de cor por máquina (T90)", () => {
  it("sem regra configurada, nada é bloqueado", () => {
    expect(colorSequenceViolation({ rule: null, newLabL: 90, prevLabL: 20, nextLabL: null })).toBeNull();
  });

  it("sem L* informado, não há referência e nada é presumido", () => {
    expect(colorSequenceViolation({ rule: "light_to_dark", newLabL: null, prevLabL: 20, nextLabL: 95 })).toBeNull();
  });

  it("escurecendo na sequência é válido; clareando é violação", () => {
    expect(colorSequenceViolation({ rule: "light_to_dark", newLabL: 40, prevLabL: 80, nextLabL: null })).toBeNull();
    expect(colorSequenceViolation({ rule: "light_to_dark", newLabL: 70, prevLabL: 40, nextLabL: null }))
      .toMatch(/Clareamento/);
  });

  it("inserir escuro antes de claro também viola (próxima clarearia)", () => {
    expect(colorSequenceViolation({ rule: "light_to_dark", newLabL: 30, prevLabL: null, nextLabL: 80 }))
      .toMatch(/Clareamento/);
  });

  it("regra desconhecida no cadastro é tratada como não configurada", () => {
    expect(normalizeColorSequencingRule("qualquer")).toBeNull();
    expect(normalizeColorSequencingRule("light_to_dark")).toBe("light_to_dark");
  });
});
