import type { TablesInsert } from '@/integrations/supabase/types';
import type { DbClient } from '@/hooks/commercial/useClients';
import { validateCNPJ, validateCPF, validateEmail } from '@/lib/maskUtils';

export const defaultForm = {
  person_type: 'PJ' as 'PF' | 'PJ',
  name: '', trade_name: '', document: '', document_type: 'cnpj' as string,
  email: '', phone: '', cellphone: '',
  address_street: '', address_number: '', address_complement: '',
  address_neighborhood: '', address_city: '', address_state: '', address_zip_code: '',
  status: 'active', credit_limit: '', segment: '', sales_rep_id: '',
  state_registration: '', municipal_registration: '',
  region: '', micro_region: '', default_payment_condition: 'À vista',
  price_table: 'default', abc_classification: 'C', client_score: 'medium',
  commercial_notes: '', estimated_potential: '',
  rg: '', birth_date: '', gender: '',
  cnae_primary: '', cnae_description: '', receita_status: '', receita_status_date: '',
};

export type ClientForm = typeof defaultForm;

/**
 * QA-UX (rodada 9): o banco exige
 * `CHECK (document_type IN ('CPF','CNPJ'))` (migration 20260702024835),
 * mas o formulario sempre trabalhou com `'cpf'`/`'cnpj'` em minusculas.
 * O `INSERT` de cliente falhava com 23514 e o toast sanitizado mostrava
 * apenas "Ocorreu um erro inesperado" — criacao de cliente QUEBRADA sem
 * nenhum teste detectar (o E2E isolado nunca criava cliente pela UI).
 *
 * Contrato a partir daqui: form state = minusculas; banco = MAIUSCULAS.
 * A conversao acontece somente nestas duas funcoes, na entrada e na saida.
 */
export function toDbDocumentType(value: string | null | undefined): 'CPF' | 'CNPJ' {
  return String(value || '').toUpperCase() === 'CPF' ? 'CPF' : 'CNPJ';
}

export function toFormDocumentType(value: string | null | undefined): string {
  return String(value || 'cnpj').toLowerCase();
}

export function clientToForm(client: DbClient): ClientForm {
  const c = client as DbClient & Partial<{
    person_type: 'PF' | 'PJ'; rg: string; birth_date: string; gender: string;
    cnae_primary: string; cnae_description: string; receita_status: string; receita_status_date: string;
  }>;
  return {
    person_type: c.person_type || (toFormDocumentType(c.document_type) === 'cpf' ? 'PF' : 'PJ'),
    name: c.name, trade_name: c.trade_name || '', document: c.document,
    document_type: toFormDocumentType(c.document_type), email: c.email, phone: c.phone,
    cellphone: c.cellphone || '',
    address_street: c.address_street, address_number: c.address_number,
    address_complement: c.address_complement || '', address_neighborhood: c.address_neighborhood,
    address_city: c.address_city, address_state: c.address_state,
    address_zip_code: c.address_zip_code,
    status: c.status, credit_limit: String(c.credit_limit), segment: c.segment || '',
    sales_rep_id: c.sales_rep_id || '',
    state_registration: c.state_registration || '', municipal_registration: c.municipal_registration || '',
    region: c.region || '', micro_region: c.micro_region || '',
    default_payment_condition: c.default_payment_condition || 'À vista',
    price_table: c.price_table || 'default', abc_classification: c.abc_classification || 'C',
    client_score: c.client_score || 'medium',
    commercial_notes: c.commercial_notes || '', estimated_potential: String(c.estimated_potential || ''),
    rg: c.rg || '', birth_date: c.birth_date || '', gender: c.gender || '',
    cnae_primary: c.cnae_primary || '', cnae_description: c.cnae_description || '',
    receita_status: c.receita_status || '', receita_status_date: c.receita_status_date || '',
  };
}

export function validateClientForm(f: ClientForm): Record<string, string> {
  const e: Record<string, string> = {};
  const isPJ = f.person_type === 'PJ';
  const docType = toFormDocumentType(f.document_type);
  if (!f.name.trim()) e.name = 'Nome obrigatório';
  if (!f.document.trim()) e.document = 'Documento obrigatório';
  else if (docType === 'cnpj' && !validateCNPJ(f.document)) e.document = 'CNPJ inválido';
  else if (docType === 'cpf' && !validateCPF(f.document)) e.document = 'CPF inválido';
  if (isPJ) {
    if (!f.email.trim()) e.email = 'E-mail obrigatório';
    else if (!validateEmail(f.email)) e.email = 'E-mail inválido';
    if (!f.phone.trim()) e.phone = 'Telefone obrigatório';
    if (!f.address_zip_code.trim()) e.address_zip_code = 'CEP obrigatório';
    if (!f.address_city.trim()) e.address_city = 'Cidade obrigatória';
    if (!f.address_state.trim()) e.address_state = 'UF obrigatório';
  } else if (f.email.trim() && !validateEmail(f.email)) {
    e.email = 'E-mail inválido';
  }
  return e;
}

export type ClientPayload = Omit<TablesInsert<'clients'>, 'code' | 'company_id'>;

export function buildClientPayload(f: ClientForm): ClientPayload {
  const isPJ = f.person_type === 'PJ';
  return {
    person_type: f.person_type,
    name: f.name, trade_name: isPJ ? (f.trade_name || null) : null, document: f.document,
    document_type: toDbDocumentType(f.document_type), email: f.email || '', phone: f.phone || '',
    cellphone: f.cellphone || null,
    address_street: f.address_street, address_number: f.address_number,
    address_complement: f.address_complement || null, address_neighborhood: f.address_neighborhood,
    address_city: f.address_city, address_state: f.address_state,
    address_zip_code: f.address_zip_code,
    status: f.status, credit_limit: Number(f.credit_limit) || 0,
    current_balance: 0, segment: f.segment || null,
    sales_rep_id: f.sales_rep_id || null,
    client_score: f.client_score || 'medium',
    state_registration: isPJ ? (f.state_registration || null) : null,
    municipal_registration: isPJ ? (f.municipal_registration || null) : null,
    region: f.region || null, micro_region: f.micro_region || null,
    default_payment_condition: f.default_payment_condition || 'À vista',
    price_table: f.price_table || 'default',
    abc_classification: f.abc_classification || 'C',
    commercial_notes: f.commercial_notes || null,
    estimated_potential: Number(f.estimated_potential) || 0,
    rg: !isPJ ? (f.rg || null) : null,
    birth_date: !isPJ && f.birth_date ? f.birth_date : null,
    gender: !isPJ ? (f.gender || null) : null,
    cnae_primary: isPJ ? (f.cnae_primary || null) : null,
    cnae_description: isPJ ? (f.cnae_description || null) : null,
    receita_status: isPJ ? (f.receita_status || null) : null,
    receita_status_date: isPJ && f.receita_status_date ? f.receita_status_date : null,
  };
}

export type Update = (patch: Partial<ClientForm>) => void;
