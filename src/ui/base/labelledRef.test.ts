import { describe, it, expect, beforeEach } from "vitest";
import { deriveLabelFromDom } from "./labelledRef";

/**
 * QA-UX (rodada 11, UX9-04/UX10-03) — regressao do nome acessivel.
 *
 * O `Input` da r4 deriva `aria-label` do placeholder e a r6 nao
 * sobrescrevia nomes existentes. Com isso o CEP era anunciado como
 * "00000-000" em vez de "CEP *". A r11 marca a ORIGEM do nome e permite
 * que o rotulo visivel prevaleca, sem tocar em nomes explicitos.
 */
const input = (html: string): HTMLInputElement => {
  document.body.innerHTML = html;
  const el = document.querySelector("input");
  if (!el) throw new Error("input ausente no fixture");
  return el as HTMLInputElement;
};

beforeEach(() => { document.body.innerHTML = ""; });

describe("deriveLabelFromDom", () => {
  it("nao sobrescreve aria-label explicito", () => {
    const el = input('<div><label>Rotulo Visivel</label><input aria-label="Nome deliberado"></div>');
    deriveLabelFromDom(el);
    expect(el.getAttribute("aria-label")).toBe("Nome deliberado");
  });

  it("substitui nome derivado de placeholder pelo rotulo irmao", () => {
    const el = input('<div><label>Telefone *</label><input placeholder="(00) 0000-0000" aria-label="(00) 0000-0000" data-ux-label-source="placeholder"></div>');
    deriveLabelFromDom(el);
    expect(el.getAttribute("aria-label")).toBe("Telefone *");
    expect(el.getAttribute("data-ux-label-source")).toBe("label");
  });

  it("encontra o rotulo mesmo com wrapper (caso real do CEP)", () => {
    const el = input(`
      <div>
        <label>CEP *</label>
        <div class="flex">
          <input placeholder="00000-000" aria-label="00000-000" data-ux-label-source="placeholder">
          <button type="button">Buscar</button>
        </div>
      </div>`);
    deriveLabelFromDom(el);
    expect(el.getAttribute("aria-label")).toBe("CEP *");
    expect(el.getAttribute("data-ux-label-source")).toBe("label");
  });

  it("mantem o placeholder quando nao existe rotulo visivel (r4 preservada)", () => {
    const el = input('<div><input placeholder="Buscar..." aria-label="Buscar..." data-ux-label-source="placeholder"></div>');
    deriveLabelFromDom(el);
    expect(el.getAttribute("aria-label")).toBe("Buscar...");
    expect(el.getAttribute("data-ux-label-source")).toBe("placeholder");
  });

  it("respeita aria-labelledby e id (FormField)", () => {
    const a = input('<div><label id="l1">Rotulo</label><input aria-labelledby="l1" aria-label="placeholder-derived" data-ux-label-source="placeholder"></div>');
    deriveLabelFromDom(a);
    expect(a.getAttribute("aria-label")).toBe("placeholder-derived");

    const b = input('<div><label for="campo">Rotulo</label><input id="campo" aria-label="x" data-ux-label-source="placeholder"></div>');
    deriveLabelFromDom(b);
    expect(b.getAttribute("aria-label")).toBe("x");
  });

  it("nao trata id interno do Radix como associacao (r12)", () => {
    document.body.innerHTML = `
      <div>
        <label>Forma de Pagamento</label>
        <button id="radix-:r1:" role="combobox"></button>
      </div>`;
    const trigger = document.querySelector("button") as HTMLButtonElement;
    deriveLabelFromDom(trigger);
    expect(trigger.getAttribute("aria-label")).toBe("Forma de Pagamento");
  });

  it("nao herda o rotulo de um campo vizinho", () => {
    document.body.innerHTML = `
      <div>
        <label>Rotulo do primeiro</label>
        <input id="primeiro">
        <input placeholder="00000-000" aria-label="00000-000" data-ux-label-source="placeholder">
      </div>`;
    const el = document.querySelectorAll("input")[1] as HTMLInputElement;
    deriveLabelFromDom(el);
    expect(el.getAttribute("aria-label")).toBe("00000-000");
  });
});
