import { useCallback, useEffect, useRef } from 'react';

/**
 * QA-UX / S005 — "facilitador" de lançamento por teclado pedido pelo cliente
 * (planilha "Solicitações para a USE", S005: "Verificar lançamento com TAB").
 *
 * Em telas de apontamento o operador digita dezenas de campos em sequência.
 * TAB já funciona, mas o hábito de ERPs de chão de fábrica é confirmar cada
 * campo com ENTER. Este hook faz ENTER avançar para o próximo campo do
 * container (SHIFT+ENTER volta), sem submeter o formulário no meio do
 * preenchimento.
 *
 * Implementação com CALLBACK REF (não useEffect + ref de objeto): o Radix
 * Dialog monta o DialogContent em um Portal somente quando `open` vira true.
 * Com `useEffect([])` o efeito rodava enquanto `ref.current` ainda era null e
 * o listener nunca era registrado — medido no Chromium (Enter não movia o
 * foco). O callback ref é invocado no momento exato da montagem.
 *
 * Regras de segurança:
 *  - ignora TEXTAREA, BUTTON, contenteditable e comboboxes (Radix Select),
 *    para não quebrar menus, observações multilinha ou botões;
 *  - no ÚLTIMO campo não intercepta nada: ENTER mantém o comportamento
 *    nativo (submeter / fechar), evitando prender o usuário no formulário;
 *  - só age dentro do container; não é um listener global.
 *
 * Uso:
 *   const formRef = useEnterToNextField<HTMLDivElement>();
 *   return <div ref={formRef}>...</div>;
 */
const FIELD_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
  'select:not([disabled])',
  '[role="combobox"]:not([aria-disabled="true"])',
].join(', ');

export function useEnterToNextField<T extends HTMLElement = HTMLDivElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (!target || !node.contains(target)) return;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.isContentEditable) return;
      if (target.getAttribute('role') === 'combobox') return;

      const fields = Array.from(node.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
        .filter((el) => el.getAttribute('tabindex') !== '-1');
      const index = fields.indexOf(target);
      if (index < 0) return;

      const next = fields[event.shiftKey ? index - 1 : index + 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement) {
        try { next.select(); } catch { /* tipo de input sem select() */ }
      }
    };

    node.addEventListener('keydown', onKeyDown);
    cleanupRef.current = () => node.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);
  return ref;
}
