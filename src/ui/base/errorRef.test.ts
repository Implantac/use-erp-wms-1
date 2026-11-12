import { describe, it, expect, beforeEach } from "vitest";
import { associateErrorFromDom } from "./errorRef";

/**
 * QA-UX (rodada 15) — regressao da associacao erro <-> campo.
 * Espelha labelledRef.test.ts: fixtures HTML reais, sem mock de backend.
 */
const control = (html: string): HTMLInputElement => {
  document.body.innerHTML = html;
  const el = document.querySelector("input");
  if (!el) throw new Error("input ausente no fixture");
  return el as HTMLInputElement;
};

beforeEach(() => { document.body.innerHTML = ""; });

describe("associateErrorFromDom", () => {
  it("liga o <p> de erro ao campo invalido com id, role=alert e aria-describedby", () => {
    const el = control(`
      <div><label>Nome *</label>
        <input aria-invalid="true">
        <p class="text-xs text-destructive">Nome obrigatório</p>
      </div>`);
    associateErrorFromDom(el);
    const p = document.querySelector("p") as HTMLElement;
    expect(p.id).toMatch(/^ux-err-/);
    expect(p.getAttribute("role")).toBe("alert");
    expect(el.getAttribute("aria-describedby")).toContain(p.id);
    expect(document.getElementById(p.id)?.textContent).toContain("Nome obrigatório");
  });

  it("encontra a mensagem mesmo com wrapper (caso real do CNPJ)", () => {
    const el = control(`
      <div>
        <label>CNPJ *</label>
        <div class="flex"><input aria-invalid="true"><button type="button">Buscar</button></div>
        <p class="text-destructive">Documento obrigatório</p>
      </div>`);
    associateErrorFromDom(el);
    const id = el.getAttribute("aria-describedby") || "";
    expect(id).toMatch(/^ux-err-/);
    expect(document.getElementById(id)?.textContent).toContain("Documento obrigatório");
  });

  it("nao associa nada quando o campo nao esta invalido", () => {
    const el = control('<div><input><p class="text-destructive">Erro de outro estado</p></div>');
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBeNull();
    expect(document.querySelector("p")?.getAttribute("role")).toBeNull();
  });

  it("respeita aria-describedby explicito do FormField sem duplicar", () => {
    const el = control(`
      <div><input aria-invalid="true" aria-describedby="campo-error">
        <p id="campo-error" role="alert" class="text-destructive">Campo obrigatório</p>
      </div>`);
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBe("campo-error");
    expect(document.querySelectorAll('[id^="ux-err-"]').length).toBe(0);
  });

  it("remove a associacao quando o erro desaparece", () => {
    const el = control('<div><input aria-invalid="true"><p class="text-destructive">Inválido</p></div>');
    associateErrorFromDom(el);
    const id = el.getAttribute("aria-describedby");
    expect(id).toMatch(/^ux-err-/);
    el.removeAttribute("aria-invalid");
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBeNull();
  });

  it("preserva descritores explicitos de dica ao limpar", () => {
    const el = control(`
      <div><input aria-invalid="true" aria-describedby="dica"><p id="dica">Texto curto</p>
        <p class="text-destructive">Valor inválido</p></div>`);
    // "Texto curto" resolve, entao o contrato explicito e respeitado.
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBe("dica");
  });

  it("nao liga a mensagem de um campo vizinho (container com 2 controles)", () => {
    const el = control(`
      <div>
        <input aria-invalid="true" id="a"><input id="b">
        <p class="text-destructive">Erro do segundo campo</p>
      </div>`);
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBeNull();
  });

  it("ignora asteriscos, texto curto e dicas de botao travado", () => {
    const el = control(`
      <div><input aria-invalid="true">
        <p class="text-destructive">*</p>
        <p class="text-destructive" data-ux-hint>Preencha os campos para continuar</p>
      </div>`);
    associateErrorFromDom(el);
    expect(el.getAttribute("aria-describedby")).toBeNull();
  });
});
