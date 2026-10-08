import type { NFe } from '@/types/fiscal';

/**
 * Never synthesize a purported NF-e from display data. The old exporter used
 * a fictitious issuer, default CFOP and invented protocol. Only the original
 * signed/authorized XML returned by a fiscal provider may be downloaded.
 */
export function generateNFeXML(_nfe: NFe): never {
  throw new Error('XML oficial indisponível: é necessário obter o arquivo assinado e autorizado do provedor fiscal.');
}
