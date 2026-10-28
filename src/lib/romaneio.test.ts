import { describe, expect, it } from 'vitest';
import { buildRomaneioText, cleanPhoneBR, groupReadyTransfers, mailtoUrl, whatsappUrl } from './romaneio';

const mov = (over: any) => ({
  id: over.id,
  kind: over.kind,
  raw_status: over.raw_status || 'SUGERIDA',
  romaneio_id: over.romaneio_id || null,
  origin_id: over.origin_id || 'cd1',
  destination_id: over.destination_id || 'loja1',
  origin_name: 'CD',
  destination_name: over.destination_name || 'Loja 1',
  destination_company: 'Texas Farm',
  items_count: over.items_count ?? 1,
  created_at: over.created_at || '2026-10-27T10:00:00Z',
});

describe('groupReadyTransfers', () => {
  it('agrupa por destino, FIFO por data, e fica fora quem não está pronto', () => {
    const groups = groupReadyTransfers([
      mov({ id: 'b', created_at: '2026-10-26T10:00:00Z' }),
      mov({ id: 'a', created_at: '2026-10-25T10:00:00Z' }),
      mov({ id: 'c', destination_id: 'loja2', destination_name: 'Loja 2' }),
      mov({ id: 'd', raw_status: 'EM TRÂNSITO' }),
      mov({ id: 'e', romaneio_id: 'rom-1' }),
      mov({ id: 'f', kind: 'intercompany' }),
      mov({ id: 'g', raw_status: 'EXPEDIDA' }),
    ]);
    expect(groups).toHaveLength(2);
    const Loja1 = groups.find((g) => g.destinationName === 'Loja 1');
    expect(Loja1?.transfers.map((t) => t.id)).toEqual(['a', 'b', 'g']);
    expect(Loja1?.totalItems).toBe(3);
    const loja2 = groups.find((g) => g.destinationName === 'Loja 2');
    expect(loja2?.transfers.map((t) => t.id)).toEqual(['c']);
  });

  it('sem movimentos prontos, nenhum grupo', () => {
    expect(groupReadyTransfers([])).toEqual([]);
    expect(groupReadyTransfers([mov({ id: 'x', raw_status: 'ENCERRADA' })])).toEqual([]);
  });
});

describe('buildRomaneioText', () => {
  it('manifesto contém número, destino, itens e total da carga', () => {
    const text = buildRomaneioText({
      numero: 'ROM-000123',
      status: 'EMITIDO',
      created_at: '2026-10-27T13:00:00Z',
      origin_name: 'CD',
      destination_name: 'Loja 1',
      transfers: [
        {
          id: '9e4cd1ab-0000-4000-8000-000000000000',
          items: [{ product_name: 'BOTINA ZEBU 87060', product_code: 'TXF-BOT87060', shipped_qty: 6, requested_qty: 6 }],
        },
      ],
    });
    expect(text).toContain('ROM-000123');
    expect(text).toContain('Destino: Loja 1');
    expect(text).toContain('BOTINA ZEBU 87060');
    expect(text).toContain('Total da carga: 6 un em 1 transferência(s)');
  });
});

describe('canais de envio', () => {
  it('cleanPhoneBR normaliza para o padrão wa.me com DDI 55', () => {
    expect(cleanPhoneBR('(43) 99988-7766')).toBe('5543999887766');
    expect(cleanPhoneBR('5543999887766')).toBe('5543999887766');
    expect(cleanPhoneBR('')).toBe('');
    expect(cleanPhoneBR(null)).toBe('');
  });

  it('whatsappUrl e mailtoUrl codificam a mensagem', () => {
    expect(whatsappUrl('43 99988-7766', 'olá mundo')).toBe(
      'https://wa.me/5543999887766?text=ol%C3%A1%20mundo',
    );
    const mail = mailtoUrl('loja@exemplo.com', 'Romaneio ROM-1', 'linha1\nlinha2');
    expect(mail).toContain('mailto:loja@exemplo.com');
    expect(mail).toContain('subject=Romaneio%20ROM-1');
    expect(mail).toContain('linha1%0Alinha2');
  });
});
