import { describe, expect, it } from 'vitest';
import { assertAllReinfEventsSigned } from '../../../../supabase/functions/_shared/reinf-signature-policy';

const xml = '<Reinf><evtRetPrestServ Id="ID1">dados</evtRetPrestServ><evtFechReinf Id="ID2">fecho</evtFechReinf></Reinf>';
const signature = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/><SignatureValue>abc</SignatureValue></Signature>';

describe('assinatura dos eventos EFD-Reinf', () => {
  it('aceita lote quando cada evento mantém Id e contém assinatura', () => {
    const signed = xml.replace('dados</evtRetPrestServ>', `dados${signature}</evtRetPrestServ>`)
      .replace('fecho</evtFechReinf>', `fecho${signature}</evtFechReinf>`);
    expect(() => assertAllReinfEventsSigned(xml, signed)).not.toThrow();
  });
  it('bloqueia lote sem assinatura, parcial ou sem eventos reconhecidos', () => {
    expect(() => assertAllReinfEventsSigned(xml, xml)).toThrow('reinf_events_not_signed');
    expect(() => assertAllReinfEventsSigned(xml, xml.replace('dados</evtRetPrestServ>', `dados${signature}</evtRetPrestServ>`)))
      .toThrow('reinf_events_not_signed');
    expect(() => assertAllReinfEventsSigned('<Reinf/>', '<Reinf/>')).toThrow('reinf_events_not_signed');
    const unknownEvent = xml.replace('</Reinf>', '<evtUnexpected123 Id="ID3">other</evtUnexpected123></Reinf>');
    expect(() => assertAllReinfEventsSigned(unknownEvent, unknownEvent.replace('dados</evtRetPrestServ>', `dados${signature}</evtRetPrestServ>`).replace('fecho</evtFechReinf>', `fecho${signature}</evtFechReinf>`))).toThrow('reinf_events_not_signed');
  });
  it('bloqueia evento com Id alterado', () => {
    const signed = xml.replace('Id="ID1"', 'Id="CHANGED"')
      .replace('dados</evtRetPrestServ>', `dados${signature}</evtRetPrestServ>`)
      .replace('fecho</evtFechReinf>', `fecho${signature}</evtFechReinf>`);
    expect(() => assertAllReinfEventsSigned(xml, signed)).toThrow('reinf_events_not_signed');
  });
});
