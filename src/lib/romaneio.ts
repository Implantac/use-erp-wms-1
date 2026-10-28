import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Romaneio de expedição — regras puras de agrupamento e os canais de envio
// do documento (imprimir, PDF, WhatsApp, e-mail). A regra de negócio pesada
// (autorização, estados, estoque) é do banco; aqui é só apresentação/envio.
// ---------------------------------------------------------------------------

// Estados em que a transferência já pode entrar numa carga. Expedida = já
// baixou da origem, só falta embarcar.
export const READY_STATUSES = ['SUGERIDA', 'APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA'];

export interface ReadyGroup {
  key: string;
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  destinationCompany?: string;
  transfers: any[];
  totalItems: number;
}

/**
 * Agrupa as transferências prontas para expedição por origem -> destino
 * (um romaneio = uma carga). Dentro do grupo, FIFO: a solicitação mais
 * antiga entra primeiro. Pedidos intercompany e o que já está em romaneio
 * ficam fora.
 */
export function groupReadyTransfers(movements: any[]): ReadyGroup[] {
  const groups = new Map<string, ReadyGroup>();
  for (const m of movements || []) {
    if ((m as any).kind === 'intercompany') continue;
    if (!READY_STATUSES.includes((m as any).raw_status)) continue;
    if ((m as any).romaneio_id) continue;
    const key = `${m.origin_id}->${m.destination_id}`;
    const g = groups.get(key) || {
      key,
      originId: m.origin_id,
      destinationId: m.destination_id,
      originName: m.origin_name || m.origin_type || 'Origem',
      destinationName: m.destination_name || m.destination_type || 'Destino',
      destinationCompany: m.destination_company,
      transfers: [],
      totalItems: 0,
    };
    g.transfers.push(m);
    g.totalItems += Number(m.items_count || 0);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.transfers.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }
  return [...groups.values()].sort((a, b) => a.destinationName.localeCompare(b.destinationName));
}

const fmtQty = (n: any) => Number(n || 0).toLocaleString('pt-BR');

function docTotalUnits(doc: any): number {
  return (doc?.transfers || []).reduce(
    (acc: number, t: any) =>
      acc + (t.items || []).reduce((a: number, i: any) => a + Number(i.shipped_qty || i.requested_qty || 0), 0),
    0,
  );
}

/** Manifesto em texto puro — corpo do WhatsApp/e-mail (WhatsApp entende *negrito*). */
export function buildRomaneioText(doc: any): string {
  const lines: string[] = [];
  lines.push(`*ROMANEIO ${doc.numero}*`);
  lines.push(`Status: ${doc.status}`);
  lines.push(`Emissão: ${new Date(doc.created_at).toLocaleString('pt-BR')}`);
  lines.push('');
  lines.push(`Origem: ${doc.origin_name || '—'}`);
  lines.push(`Destino: ${doc.destination_name || '—'}`);
  for (const t of doc.transfers || []) {
    lines.push('');
    lines.push(`Transferência #${String(t.id).split('-')[0].toUpperCase()}`);
    for (const i of t.items || []) {
      lines.push(`• ${i.product_name || i.product_id} (${i.product_code || 's/cód'}) — expedida: ${fmtQty(i.shipped_qty || i.requested_qty)}`);
    }
  }
  lines.push('');
  lines.push(`*Total da carga: ${fmtQty(docTotalUnits(doc))} un em ${(doc.transfers || []).length} transferência(s)*`);
  lines.push('');
  lines.push('Recepcione este romaneio na Central da Loja para baixar o estoque. Se faltar algum item, informe a quantidade real na conferência.');
  lines.push('O PDF do romaneio segue em anexo nesta conversa/e-mail.');
  return lines.join('\n');
}

/** Telefone brasileiro para o wa.me: só dígitos, com DDI 55 quando faltar. */
export function cleanPhoneBR(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function whatsappUrl(phone: string, text: string): string {
  const clean = cleanPhoneBR(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Contato cadastrado da unidade (filial tem phone/email próprios). */
export async function fetchBranchContact(branchId: string) {
  const { data } = await (supabase as any)
    .from('branches')
    .select('name, phone, email')
    .eq('id', branchId)
    .maybeSingle();
  return (data || {}) as { name?: string; phone?: string; email?: string };
}

/** Gera e baixa o PDF do romaneio (jsPDF sob demanda, sem pesar o bundle). */
export async function downloadRomaneioPdf(doc: any): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 14;
  const right = 196;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > 282) {
      pdf.addPage();
      y = 16;
    }
  };
  const text = (s: string, x: number, size = 10, style: 'normal' | 'bold' = 'normal', align: 'left' | 'right' = 'left') => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.text(s, x, y, { align });
  };

  text(`ROMANEIO ${doc.numero}`, left, 16, 'bold');
  text(String(doc.status || ''), right, 10, 'normal', 'right');
  y += 6;
  text(`Emitido em ${new Date(doc.created_at).toLocaleString('pt-BR')}`, left, 9);
  if (doc.received_at) {
    text(`Recebido em ${new Date(doc.received_at).toLocaleString('pt-BR')}`, right, 9, 'normal', 'right');
  }
  y += 4;
  pdf.setLineWidth(0.4);
  pdf.line(left, y, right, y);
  y += 8;

  // Origem / destino
  pdf.setLineWidth(0.2);
  pdf.rect(left, y, 88, 15);
  pdf.rect(106, y, 90, 15);
  const boxY = y;
  y += 5;
  text('ORIGEM (EXPEDIÇÃO)', left + 3, 8, 'bold');
  text('DESTINO (RECEBIMENTO)', 109, 8, 'bold');
  y += 6;
  text(String(doc.origin_name || '—').toUpperCase(), left + 3, 11, 'bold');
  text(String(doc.destination_name || '—').toUpperCase(), 109, 11, 'bold');
  y = boxY + 22;

  for (const t of doc.transfers || []) {
    ensureSpace(16);
    text(`Transferência #${String(t.id).split('-')[0].toUpperCase()} · ${t.current_status || ''}`, left, 10, 'bold');
    y += 5;
    // Cabeçalho da tabela
    pdf.setFillColor(235, 235, 235);
    pdf.rect(left, y - 4, right - left, 6, 'F');
    text('Produto', left + 1, 8, 'bold');
    text('Código', 104, 8, 'bold');
    text('Expedida', 168, 8, 'bold', 'right');
    text('Recebida', right, 8, 'bold', 'right');
    y += 4;
    pdf.line(left, y, right, y);
    y += 5;
    for (const i of t.items || []) {
      ensureSpace(7);
      const name = String(i.product_name || i.product_id || '');
      text(name.length > 48 ? `${name.slice(0, 47)}…` : name, left + 1, 9);
      text(String(i.product_code || ''), 104, 9);
      text(fmtQty(i.shipped_qty || i.requested_qty), 168, 9, 'normal', 'right');
      text(fmtQty(i.received_qty), right, 9, 'normal', 'right');
      y += 6;
    }
    y += 3;
  }

  ensureSpace(20);
  text(`Total da carga: ${fmtQty(docTotalUnits(doc))} un em ${(doc.transfers || []).length} transferência(s)`, left, 11, 'bold');
  y += 18;
  pdf.line(left, y, 88, y);
  pdf.line(112, y, right, y);
  y += 5;
  text('Expedido por (assinatura)', left, 8);
  text('Recebido por (assinatura e data)', 112, 8);
  y += 10;
  text('A Loja recepciona este documento na Central da Loja: a conferência alimenta o estoque automaticamente.', left, 8);

  pdf.save(`${doc.numero}.pdf`);
}
