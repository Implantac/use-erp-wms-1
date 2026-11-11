import { describe, it, expect, vi, beforeEach } from "vitest";

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { toastError, handleMutationError } from "./toastHelpers";

/**
 * QA-UX (rodada 9) — o erro que escondeu o defeito de `document_type`.
 * Quando o Postgres rejeitava o INSERT (23514), `sanitizeErrorMessage`
 * corretamente suprimia o detalhe tecnico, mas o fallback era
 * "Ocorreu um erro inesperado" — nenhuma acao para o usuario.
 */
describe("toastError", () => {
  beforeEach(() => toastMock.mockClear());

  it("nao vaza SQL mas orienta o usuario a revisar e tentar novamente", () => {
    toastError(new Error('new row for relation "clients" violates check constraint "clients_document_type_check"'));
    const call = toastMock.mock.calls[0][0] as { title: string; description: string; variant: string };
    expect(call.variant).toBe("destructive");
    expect(call.description).toMatch(/Verifique os dados e tente novamente/i);
    expect(call.description).not.toMatch(/violates|constraint|clients|PGRST|23514/i);
  });

  it("preserva mensagens de negocio em portugues", () => {
    toastError(new Error("CEP não encontrado"));
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).toBe("CEP não encontrado");
  });

  it("handleMutationError usa o mesmo fallback acionavel", () => {
    handleMutationError(new Error("violates row-level security policy"));
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).toMatch(/Verifique os dados e tente novamente/i);
    expect(call.description).not.toMatch(/policy|row-level/i);
  });

  it("QA-UX r10: nao vaza rota/metodo internos quando um DELETE falha", () => {
    handleMutationError(new Error("metodo/rota nao suportados: DELETE /rest/v1/clients"));
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).toMatch(/Verifique os dados e tente novamente/i);
    expect(call.description).not.toMatch(/DELETE|rest\/v1|metodo|rota/i);
  });
});
