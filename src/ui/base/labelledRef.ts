import type { ForwardedRef, MutableRefObject, RefCallback } from "react";

/**
 * QA-UX (rodadas 4 e 6) — nome acessível para campos de formulário soltos.
 *
 * Grande parte do ERP usa o padrão:
 *
 *   <div><Label>Texto</Label><Input /></div>
 *
 * sem `htmlFor`/`id`. Para um leitor de tela esses campos são anônimos
 * ("editar, em branco"). Este callback ref deriva `aria-label` do `<label>`
 * irmão anterior (ou do primeiro `<label>` filho do mesmo wrapper) quando o
 * campo ainda não tem nome.
 *
 * NÃO sobrescreve `aria-label`, `aria-labelledby` nem `id` explícitos —
 * assim `FormField` e os rótulos visíveis continuam tendo precedência. O
 * `Input` derivado de `placeholder` (rodada 4) também já chega com
 * `aria-label` e portanto é ignorado aqui.
 */
export function deriveLabelFromDom(node: HTMLElement): void {
  if (node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.id) return;

  let sibling = node.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === "LABEL") {
      const text = (sibling.textContent || "").trim();
      if (text) {
        node.setAttribute("aria-label", text);
        return;
      }
    }
    sibling = sibling.previousElementSibling;
  }

  const wrapperLabel = node.parentElement?.querySelector(":scope > label");
  const text = (wrapperLabel?.textContent || "").trim();
  if (text) node.setAttribute("aria-label", text);
}

/** Compõe o ref encaminhado com a derivação de rótulo, sem perder o ref original. */
export function labelledRef<T extends HTMLElement>(forwardedRef: ForwardedRef<T>): RefCallback<T> {
  return (node) => {
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef && typeof forwardedRef === "object")
      (forwardedRef as MutableRefObject<T | null>).current = node;
    if (node) deriveLabelFromDom(node);
  };
}
