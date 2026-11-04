import { describe, expect, it } from "vitest";
import {
  changeoverMinutes,
  occupiedWindow,
  requiresChangeover,
  validateChangeoverField,
} from "./machineChangeover";

describe("tempos de troca da máquina (T87)", () => {
  it("sem configuração, nenhum tempo é presumido e a janela não muda", () => {
    expect(changeoverMinutes({ setupTimeMinutes: null, cleaningTimeMinutes: null }))
      .toEqual({ setup: 0, cleaning: 0, total: 0 });
    expect(occupiedWindow(1_000_000, 2_000_000, { setupTimeMinutes: null, cleaningTimeMinutes: null }))
      .toEqual({ start: 1_000_000, end: 2_000_000 });
  });

  it("com configuração, ocupa setup antes e limpeza depois", () => {
    expect(changeoverMinutes({ setupTimeMinutes: 30, cleaningTimeMinutes: 20 }).total).toBe(50);
    expect(occupiedWindow(1_000_000, 2_000_000, { setupTimeMinutes: 30, cleaningTimeMinutes: 20 }))
      .toEqual({ start: 1_000_000 - 30 * 60_000, end: 2_000_000 + 20 * 60_000 });
  });

  it("troca só é exigida quando o artigo muda", () => {
    expect(requiresChangeover("artigo-a", "artigo-b")).toBe(true);
    expect(requiresChangeover("artigo-a", "artigo-a")).toBe(false);
    expect(requiresChangeover(null, "artigo-b")).toBe(false);
  });

  it("formulário rejeita tempo negativo e aceita vazio (não configurado)", () => {
    expect(validateChangeoverField("-5", "Setup")).toMatch(/maior ou igual a zero/);
    expect(validateChangeoverField("", "Setup")).toBeNull();
    expect(validateChangeoverField("45", "Setup")).toBeNull();
  });
});
