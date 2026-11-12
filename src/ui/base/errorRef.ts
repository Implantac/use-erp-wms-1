import type { ForwardedRef, RefCallback } from "react";
import { labelledRef } from "./labelledRef";

/**
 * QA-UX (rodada 15) — ASSOCIACAO ENTRE MENSAGEM DE ERRO E CAMPO.
 *
 * `FormField` ja faz isso corretamente (id + role=alert + aria-describedby),
 * mas a maior parte dos formularios de negocio usa o padrao solto:
 *
 *   <div><Label>Nome *</Label><Input aria-invalid="true" />
 *        <p class="text-destructive">Nome obrigatorio</p></div>
 *
 * O erro e VISIVEL, porem nao esta LIGADO ao campo: quem navega por leitor
 * de tela ouve o nome e nao o motivo da falha. Este callback ref completa
 * a associacao no DOM, sem exigir reescrever cada formulario:
 *
 *   - so age quando aria-invalid="true";
 *   - respeita aria-describedby explicito que ja resolve para texto;
 *   - procura uma unica mensagem de erro folha no mesmo container (ate 2
 *     niveis, como labelledRef), e recusa containers com varios controles
 *     para nao ligar o erro do campo vizinho;
 *   - garante id estavel, role="alert" e o token em aria-describedby;
 *   - remove os tokens que ele proprio criou quando o erro desaparece.
 *
 * NAO inventa texto de erro: onde so existe toast, o formulario precisa
 * renderizar a mensagem inline (r15 em PurchaseOrders/FiberReceiptDialog).
 * NAO e validacao com leitor de tela real (NVDA/VoiceOver).
 */

const PREFIX = "ux-err-";
let sequence = 0;
const CONTROL_SELECTOR = 'input,select,textarea,[role="combobox"],[role="textbox"],[role="spinbutton"]';
const ERROR_TAGS = new Set(["P", "SPAN", "SMALL"]);
const MAX_ASCENT = 2;

const text = (el: Element | null | undefined): string =>
  (el?.textContent || "").replace(/\s+/g, " ").trim();

function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true;
  const view = el.ownerDocument.defaultView;
  return !!view && view.getComputedStyle(el).display === "none";
}

function isErrorLeaf(el: Element): el is HTMLElement {
  if (!ERROR_TAGS.has(el.tagName) || !(el instanceof HTMLElement)) return false;
  if (el.children.length || isHidden(el)) return false;
  if (el.closest("[data-sonner-toast],[data-sonner-toaster],[data-ux-hint]")) return false;
  const t = text(el);
  if (t.length < 4 || /^[*\s]+$/.test(t)) return false;
  const cls = el.getAttribute("class") || "";
  return el.getAttribute("role") === "alert" || /text-destructive|text-red-/.test(cls);
}

/** Sobe no maximo 2 niveis e so aceita um container com UM controle e UMA
 *  mensagem de erro folha — ambiguidade nunca vira associacao. */
function findErrorFor(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node;
  for (let depth = 0; depth <= MAX_ASCENT && current; depth++) {
    const parent = current.parentElement;
    if (!parent) break;
    const controls = Array.from(parent.querySelectorAll(CONTROL_SELECTOR))
      .filter((c) => !isHidden(c as HTMLElement));
    if (controls.length <= 1) {
      const errs = Array.from(parent.children).filter(isErrorLeaf);
      if (errs.length === 1) return errs[0];
    }
    current = parent;
    if (current.getAttribute("role") === "dialog") break;
  }
  return null;
}

function setDescribedBy(node: HTMLElement, ids: string[]): void {
  if (ids.length) node.setAttribute("aria-describedby", ids.join(" "));
  else node.removeAttribute("aria-describedby");
}

export function associateErrorFromDom(node: HTMLElement): void {
  const doc = node.ownerDocument;
  const tokens = (node.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
  const explicit = tokens.filter((id) => !id.startsWith(PREFIX));

  // Regra de limpeza: tudo que comeca com PREFIX foi criado por nos e so
  // vale enquanto o campo estiver invalido / sem contrato explicito.
  const cleanup = () => {
    if (explicit.length !== tokens.length) setDescribedBy(node, explicit);
  };

  if (node.getAttribute("aria-invalid") !== "true") { cleanup(); return; }

  const explicitResolves = explicit.some((id) => {
    const el = doc.getElementById(id);
    return !!el && text(el).length > 3;
  });
  if (explicitResolves) { cleanup(); return; }

  const err = findErrorFor(node);
  if (!err) { cleanup(); return; }

  if (!err.id) err.id = `${PREFIX}${++sequence}`;
  if (!["alert", "status"].includes(err.getAttribute("role") || "")) {
    err.setAttribute("role", "alert");
  }
  const next = [...explicit.filter((id) => id !== err.id), err.id];
  node.setAttribute("aria-describedby", next.join(" "));
}

/** Compõe a derivação de rótulo (r4/r6/r11) com a associação de erro (r15).
 *  A função é recriada a cada render, portanto o React reavalia a
 *  associação sempre que `aria-invalid` ou a mensagem mudam. */
export function fieldRef<T extends HTMLElement>(forwardedRef: ForwardedRef<T>): RefCallback<T> {
  const label = labelledRef<T>(forwardedRef);
  return (node) => {
    label(node);
    if (node) associateErrorFromDom(node);
  };
}
