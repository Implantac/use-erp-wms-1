// Pure XML envelope builder shared with regression tests. A protocol is not
// proof of authorization; the contributor must be a real company CNPJ.
export function buildReinfLoteXml(eventsXml: string, companyCnpj: string): string {
  const cnpj = companyCnpj.replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('invalid_company_cnpj');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="http://www.reinf.esocial.gov.br/schemas/envioLoteEventos/v1_05_01">
  <envioLoteEventos>
    <ideContribuinte><tpInsc>1</tpInsc><nrInsc>${cnpj}</nrInsc></ideContribuinte>
    <eventos>${eventsXml}</eventos>
  </envioLoteEventos>
</Reinf>`;
}
