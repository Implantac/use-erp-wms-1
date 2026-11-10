/**
 * QA-UX (rodada 6) — foco no primeiro campo inválido após um submit vazio.
 *
 * Medido na rodada 6: em 3 de 5 jornadas, clicar em "Cadastrar Cliente",
 * "Criar pedido" ou "Registrar recebimento" com o formulario vazio deixava
 * o foco NO BOTAO, enquanto as mensagens de erro apareciam em outro lugar
 * da tela. Para quem navega por teclado/leitor de tela, o erro nao esta
 * ligado a nada: e preciso voltar a tabular do inicio ate achar o campo.
 *
 * `focusFirstInvalidField` escolhe, nesta ordem:
 *   1. o campo marcado com `data-field` igual a `field` (quando a validacao
 *      sabe exatamente qual campo falhou);
 *   2. o primeiro campo com `aria-invalid="true"`, na ordem do DOM;
 *   3. o primeiro campo editavel visivel (rede de seguranca).
 *
 * Radix `SelectTrigger` renderiza `<button role="combobox">`, por isso o
 * seletor inclui `role="combobox"` alem dos controles nativos.
 *
 * `scheduleFocusInvalid` espera um macrotask: `setTab(...)`/`setError(...)`
 * so renderizam o campo e a marca de invalidade depois do commit do React.
 */
const FIELD_SELECTOR = [
  "input:not([type=hidden]):not([type=button]):not([type=submit])",
  "select",
  "textarea",
  '[role="combobox"]',
  '[role="textbox"]',
].join(",");

function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return false;
  if (el instanceof HTMLInputElement && el.readOnly) return false;
  // Tabs/Radix escondem conteudo inativo com `hidden` ou display:none.
  if (el.closest('[hidden], [data-state="inactive"]')) return false;
  return el.getClientRects().length > 0;
}

export function focusFirstInvalidField(
  container: ParentNode | null | undefined,
  field?: string | null,
): boolean {
  if (!container || typeof document === "undefined") return false;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
    .filter(isFocusable);

  const target =
    (field ? candidates.find((el) => el.dataset.field === field) : undefined) ??
    candidates.find((el) => el.getAttribute("aria-invalid") === "true") ??
    candidates[0];

  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

export function scheduleFocusInvalid(
  getContainer: () => ParentNode | null | undefined,
  field?: string | null,
): void {
  window.setTimeout(() => focusFirstInvalidField(getContainer(), field), 0);
}
