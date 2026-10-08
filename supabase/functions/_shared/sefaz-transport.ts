// Transporte SOAP para a SEFAZ.
//
// O edge-runtime do Supabase (Deno Deploy) não permite apresentar certificado
// cliente A1 no handshake TLS via `fetch` (mTLS não é suportado). Duas
// estratégias suportadas:
//
// 1. **Proxy mTLS externo** (recomendado para produção): configurar
//    `SEFAZ_MTLS_PROXY_URL` como uma URL de um serviço próprio (Node/Go/
//    Cloudflare Worker mTLS binding) que aceita `{ endpoint, soap, cert_b64,
//    cert_password }` e devolve `{ status, body }`. Nenhum PFX permanece no
//    edge — o proxy trata handshake e devolve o XML de resposta.
//
// Sem proxy mTLS autenticado, falhar sem fabricar qualquer resposta fiscal.
// Simulações devem ficar em fixtures de teste isoladas, nunca no transporte.

export interface SoapRequestOptions {
  endpoint: string;
  soapAction: string;
  body: string;            // XML já com envelope SOAP
  certB64: string;
  certPassword: string;
}

export interface SoapResponse {
  status: number;
  body: string;
  simulated?: boolean;
}

const SOAP_HEADERS = {
  "Content-Type": "application/soap+xml; charset=utf-8",
};

export function wrapSoap(bodyXml: string, action: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap:Body><nfeDadosMsg xmlns="${action}">${bodyXml.replace(/<\?xml[^?]*\?>\s*/i, "")}</nfeDadosMsg></soap:Body>` +
    `</soap:Envelope>`;
}

export async function callSefaz(opts: SoapRequestOptions): Promise<SoapResponse> {
  const proxyUrl = Deno.env.get("SEFAZ_MTLS_PROXY_URL");
  const proxyToken = Deno.env.get("SEFAZ_MTLS_PROXY_TOKEN");

  if (proxyUrl) {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(proxyToken ? { "Authorization": `Bearer ${proxyToken}` } : {}),
      },
      body: JSON.stringify({
        endpoint: opts.endpoint,
        soap_action: opts.soapAction,
        headers: SOAP_HEADERS,
        soap: opts.body,
        cert_b64: opts.certB64,
        cert_password: opts.certPassword,
      }),
    });
    if (!res.ok) throw new Error(`Proxy mTLS SEFAZ indisponível (HTTP ${res.status}). Nenhuma autorização confirmada.`);
    const body = await res.text();
    return { status: res.status, body };
  }

  throw new Error('Transporte SEFAZ indisponível: configure proxy mTLS homologado. Nenhum protocolo foi recebido.');
}

/** Extrai o par (cStat, xMotivo) do XML de resposta. */
export function parseSefazReturn(xml: string): { cStat?: string; xMotivo?: string; nProt?: string; digVal?: string } {
  const pick = (tag: string): string | undefined => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1] : undefined;
  };
  // Prefer protNFe fields when present (autorização OK) senão retEnviNFe.
  return {
    cStat: pick("cStat"),
    xMotivo: pick("xMotivo"),
    nProt: pick("nProt"),
    digVal: pick("digVal"),
  };
}
