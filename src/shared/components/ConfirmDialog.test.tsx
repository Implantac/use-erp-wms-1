import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialogProvider } from './ConfirmDialog';
import { useConfirm, usePrompt } from './confirmContext';

/**
 * QA-UX (rodada 3) — regressão da unificação de dialogs.
 *
 * Antes, 15 telas usavam `window.confirm` / `window.prompt` nativos:
 * bloqueantes, sem rótulo, sem foco gerenciado e sem validação. Estes testes
 * garantem que o provider global resolve boolean/texto/null corretamente e
 * que `required` impede confirmação com campo vazio.
 */
function Harness({
  onConfirm,
  onPrompt,
}: {
  onConfirm: (v: boolean) => void;
  onPrompt: (v: string | null) => void;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  return (
    <>
      <button onClick={async () => onConfirm(await confirm({ title: 'Excluir registro?', confirmLabel: 'Excluir' }))}>
        abrir-confirm
      </button>
      <button onClick={async () => onPrompt(await prompt({
        title: 'Motivo', inputLabel: 'Justificativa', required: true, confirmLabel: 'Enviar',
      }))}>
        abrir-prompt
      </button>
    </>
  );
}

const setup = () => {
  const onConfirm = vi.fn();
  const onPrompt = vi.fn();
  render(
    <ConfirmDialogProvider>
      <Harness onConfirm={onConfirm} onPrompt={onPrompt} />
    </ConfirmDialogProvider>
  );
  return { onConfirm, onPrompt };
};

describe('ConfirmDialogProvider — confirm', () => {
  it('abre dialog acessível e resolve true ao confirmar', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByText('abrir-confirm'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir registro?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(true));
  });

  it('resolve false ao cancelar', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByText('abrir-confirm'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(false));
  });
});

describe('ConfirmDialogProvider — prompt', () => {
  it('campo tem rótulo associado e required bloqueia confirmação vazia', async () => {
    const { onPrompt } = setup();
    fireEvent.click(screen.getByText('abrir-prompt'));
    await screen.findByRole('alertdialog');

    const input = screen.getByLabelText(/Justificativa/) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.required).toBe(true);

    const submit = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Lote reprovado na inspeção' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onPrompt).toHaveBeenCalledWith('Lote reprovado na inspeção'));
  });

  it('resolve null ao cancelar', async () => {
    const { onPrompt } = setup();
    fireEvent.click(screen.getByText('abrir-prompt'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(onPrompt).toHaveBeenCalledWith(null));
  });
});
