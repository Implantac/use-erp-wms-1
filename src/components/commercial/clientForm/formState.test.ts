import { describe, it, expect } from "vitest";
import {
  defaultForm,
  buildClientPayload,
  clientToForm,
  toDbDocumentType,
  toFormDocumentType,
  validateClientForm,
} from "./formState";
import type { DbClient } from "@/hooks/commercial/useClients";

/**
 * QA-UX (rodada 9) — regressao do defeito funcional mais grave encontrado
 * nas rodadas de UX: o formulario enviava `document_type: 'cnpj'` enquanto
 * a migration 20260702024835 exige
 * `CHECK (document_type IN ('CPF','CNPJ'))`. Todo INSERT de cliente
 * falhava com 23514 e o E2E isolado (24/24) nao detectava, pois nenhum
 * teste criava cliente pela UI.
 *
 * Contrato: form state em minusculas, banco em MAIUSCULAS.
 */

describe("normalizacao de document_type", () => {
  it("converte para o formato exigido pelo CHECK constraint", () => {
    expect(toDbDocumentType("cnpj")).toBe("CNPJ");
    expect(toDbDocumentType("cpf")).toBe("CPF");
    expect(toDbDocumentType("CNPJ")).toBe("CNPJ");
    expect(toDbDocumentType("CPF")).toBe("CPF");
    expect(toDbDocumentType(null)).toBe("CNPJ");
  });

  it("converte a leitura do banco de volta para o form state", () => {
    expect(toFormDocumentType("CNPJ")).toBe("cnpj");
    expect(toFormDocumentType("CPF")).toBe("cpf");
    expect(toFormDocumentType(undefined)).toBe("cnpj");
  });
});

describe("payload de cliente", () => {
  it("envia document_type em maiusculas, aceito pelo banco", () => {
    const payload = buildClientPayload({
      ...defaultForm,
      name: "Cliente Sintético",
      document: "12.345.678/0001-95",
      email: "teste@exemplo.invalid",
      phone: "1133334444",
      address_zip_code: "01310-100",
      address_city: "São Paulo",
      address_state: "SP",
    });
    expect(payload.document_type).toBe("CNPJ");
    expect(["CPF", "CNPJ"]).toContain(payload.document_type);
  });

  it("mantem a validacao local funcionando com o form state em minusculas", () => {
    const form = {
      ...defaultForm,
      name: "Cliente Sintético",
      document: "12.345.678/0001-95",
      document_type: "cnpj",
      email: "teste@exemplo.invalid",
      phone: "1133334444",
      address_zip_code: "01310-100",
      address_city: "São Paulo",
      address_state: "SP",
    };
    expect(validateClientForm(form)).toEqual({});
  });

  it("reidrata um registro real do banco (maiusculas) sem virar PJ por engano", () => {
    const db = {
      document_type: "CPF",
      name: "Pessoa Física",
      document: "52998224725",
    } as unknown as DbClient;
    const form = clientToForm(db);
    expect(form.document_type).toBe("cpf");
    expect(form.person_type).toBe("PF");
  });
});
