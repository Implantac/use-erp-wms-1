import { describe, it, expect } from 'vitest';
import { reducer, type State } from './use-toast';

const notice = (id: string, title: string, description?: string) => ({ id, title, description });

/**
 * QA-UX (2a rodada): regressão do empilhamento de toasts idênticos.
 * Medido no Chromium: duas tentativas de login geravam dois avisos vermelhos
 * iguais sobrepostos, cobrindo o formulário.
 */
describe('reducer ADD_TOAST — dedupe de avisos', () => {
  const empty: State = { toasts: [] };

  it('adiciona um toast normalmente', () => {
    const state = reducer(empty, { type: 'ADD_TOAST', toast: notice('1', 'Erro', 'Falhou') });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('1');
  });

  it('não empilha avisos idênticos e mantém o mais recente', () => {
    let state = reducer(empty, { type: 'ADD_TOAST', toast: notice('1', 'Erro', 'Falhou') });
    state = reducer(state, { type: 'ADD_TOAST', toast: notice('2', 'Erro', 'Falhou') });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('2');
  });

  it('mantém avisos com conteúdo diferente', () => {
    let state = reducer(empty, { type: 'ADD_TOAST', toast: notice('1', 'Erro', 'Falhou') });
    state = reducer(state, { type: 'ADD_TOAST', toast: notice('2', 'Atenção', 'Verifique os campos') });
    expect(state.toasts).toHaveLength(2);
  });

  it('respeita o limite máximo de toasts', () => {
    let state = empty;
    for (let i = 0; i < 9; i++) {
      state = reducer(state, { type: 'ADD_TOAST', toast: notice(String(i), `Aviso ${i}`) });
    }
    expect(state.toasts.length).toBeLessThanOrEqual(5);
  });
});
