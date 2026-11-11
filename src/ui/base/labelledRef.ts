import type { ForwardedRef, MutableRefObject, RefCallback } from "react";

/**
 * QA-UX (rodadas 4, 6 e 11) — nome acessível para campos de formulário soltos.
 *
 * Grande parte do ERP usa o padrão:
 *
 *   <div><Label>Texto</Label><Input /></div>
 *
 * sem `htmlFor`/`id`. Para um leitor de tela esses campos são anônimos
 * ("editar, em branco"). Este callback ref deriva `aria-label` do `<label>`
 * visível quando o campo ainda não tem nome.
 *
 * UX9-04/UX10-03 (rodada 11): o `Input` da r4 deriva `aria-label` do
 * `placeholder`, e a r6 deliberadamente NÃO sobrescrevia nomes existentes.
 * Isso fazia o CEP ser anunciado como "00000-000" em vez de "CEP *", e
 * outros 5 campos como "(00) 0000-0000" em vez de "Telefone *".
 * Agora o `Input` marca a ORIGEM do nome (`data-ux-label-source`), e aqui
 * o nome derivado de placeholder PODE ceder ao rótulo visível. Nomes
 * explicitamente escritos pelo desenvolvedor continuam intocáveis.
 *
 * A busca sobe até 2 níveis porque vários campos ficam dentro de um wrapper
 * (ex.: CEP + botão de busca em `<div class="flex">`), com o `<Label>` como
 * irmão do wrapper, não do input.
 */

const CONTROL_SELECTOR = 'input,select,textarea,[role="combobox"],[role="textbox"]';
const MAX_ASCENT = 2;

const text = (el: Element | null | undefined): string => (el?.textContent || "").trim();

function findVisibleLabel(node: HTMLElement): string {
  const doc = node.ownerDocument;

  // 1) Associação explicita label[for].
  if (node.id) {
    const explicit = text(doc.querySelector(`label[for="${CSS.escape(node.id)}"]`));
    if (explicit) return explicit;
  }
  // 2) Campo dentro do proprio <label>.
  const wrapped = text(node.closest("label"));
  if (wrapped) return wrapped;

  let current: HTMLElement | null = node;
  for (let depth = 0; depth <= MAX_ASCENT && current; depth++) {
    // Irmaos anteriores. Paramos no primeiro OUTRO controle: assim nao
    // associamos o rotulo de um campo vizinho a este.
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.matches(CONTROL_SELECTOR)) break;
      if (sibling.tagName === "LABEL") {
        const t = text(sibling);
        if (t) return t;
      }
      sibling = sibling.previousElementSibling;
    }
    // Label filho direto do wrapper — so quando e o unico E o wrapper nao
    // contem varios controles. Sem essa guarda, um grid com dois inputs
    // herdaria o rotulo do campo vizinho.
    const parent = current.parentElement;
    if (parent) {
      const labels = Array.from(parent.children).filter((c) => c.tagName === "LABEL");
      const controls = Array.from(parent.children).filter((c) => c.matches(CONTROL_SELECTOR));
      if (labels.length === 1 && controls.length <= 1) {
        const t = text(labels[0]);
        if (t) return t;
      }
    }
    current = parent;
    if (current?.getAttribute("role") === "dialog") break;
  }
  return "";
}

export function deriveLabelFromDom(node: HTMLElement): void {
  // `aria-labelledby` e `label[for]` sao contratos explicitos. Um `id`
  // sozinho NAO e associacao: Radix gera ids internos (SelectTrigger,
  // r12) que nao tem nenhum label apontando para eles.
  if (node.getAttribute("aria-labelledby")) return;
  if (node.id && node.ownerDocument.querySelector(`label[for="${CSS.escape(node.id)}"]`)) return;

  const source = node.getAttribute("data-ux-label-source");
  // Nome EXPLICITO e intocavel; o derivado de placeholder pode ser corrigido.
  if (node.getAttribute("aria-label") && source !== "placeholder") return;

  const label = findVisibleLabel(node);
  if (label) {
    node.setAttribute("aria-label", label);
    node.setAttribute("data-ux-label-source", "label");
  }
  // Sem rotulo visivel: mantem o placeholder derivado pela r4. Campos que
  // nao tem <label> algum continuam nomeados, sem regressao.
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
