// EFD-Reinf — transmissão: sem certificado e endpoint, falha fechada.
// Apenas resposta oficial do transporte pode ser tratada como transmissão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/require-auth.ts";
import { signReinfXml } from "../_shared/reinf-sign.ts";
import { buildReinfLoteXml } from "../_shared/reinf-lote-xml.ts";
import { tenantReinfCertificateSecrets } from "../_shared/reinf-tenant-cert.ts";
import { validateReinfCertificate } from "../_shared/reinf-certificate-policy.ts";
import { normalizeValidReinfCnpj } from "../_shared/reinf-cnpj.ts";

type EventType = "R-2010" | "R-2020" | "R-4020" | "R-2099" | "R-4099";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function fmt(n: unknown): string {
  return Number(n ?? 0).toFixed(2);
}

function buildEventXml(e: any): string {
  const id = `ID${e.event_type.replace("-", "")}${(e.id as string).replace(/-/g, "").slice(0, 20)}`;
  const comp = (e.data_emissao || "").slice(0, 7);
  switch (e.event_type as EventType) {
    case "R-2010":
      return `<evtRetPrestServ Id="${id}">
  <ideEvento><indRetif>1</indRetif><perApur>${esc(comp)}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>USE-ERP-1.0</verProc></ideEvento>
  <ideContri><tpInsc>1</tpInsc><nrInsc>${esc(e.cnpj_beneficiario || "")}</nrInsc></ideContri>
  <ideEstabObra><tpInscEstab>1</tpInscEstab><nrInscEstab>${esc(e.cnpj_prestador || "")}</nrInscEstab>
    <nfs><serie>1</serie><numDocto>${esc(e.nota_fiscal || "")}</numDocto><dtEmissaoNF>${esc(e.data_emissao || "")}</dtEmissaoNF>
      <vlrBruto>${fmt(e.vr_bruto)}</vlrBruto>
      <infoTpServ><tpServico>${esc(e.cod_serv || "100000")}</tpServico>
        <vlrBaseRet>${fmt(e.vr_bruto)}</vlrBaseRet><vlrRetencao>${fmt(e.vr_ret_inss)}</vlrRetencao></infoTpServ>
    </nfs></ideEstabObra>
</evtRetPrestServ>`;
    case "R-2020":
      // R-2020: retenção INSS sobre serviços PRESTADOS. Contribuinte = a própria empresa (prestador);
      // ideTomadorServ = CNPJ do cliente que reteve.
      return `<evtServTom Id="${id}">
  <ideEvento><indRetif>1</indRetif><perApur>${esc(comp)}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>USE-ERP-1.0</verProc></ideEvento>
  <ideContri><tpInsc>1</tpInsc><nrInsc>${esc(e.cnpj_prestador || "")}</nrInsc></ideContri>
  <ideTomadorServ><tpInscTomador>1</tpInscTomador><nrInscTomador>${esc(e.cnpj_beneficiario || "")}</nrInscTomador>
    <nfs><serie>1</serie><numDocto>${esc(e.nota_fiscal || "")}</numDocto><dtEmissaoNF>${esc(e.data_emissao || "")}</dtEmissaoNF>
      <vlrBruto>${fmt(e.vr_bruto)}</vlrBruto>
      <infoTpServ><tpServico>${esc(e.cod_serv || "100000")}</tpServico>
        <vlrBaseRet>${fmt(e.vr_bruto)}</vlrBaseRet><vlrRetencao>${fmt(e.vr_ret_inss)}</vlrRetencao></infoTpServ>
    </nfs></ideTomadorServ>
</evtServTom>`;
    case "R-4020":
      return `<evtRetPF Id="${id}">
  <ideEvento><indRetif>1</indRetif><perApur>${esc(comp)}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>USE-ERP-1.0</verProc></ideEvento>
  <ideContri><tpInsc>1</tpInsc><nrInsc>${esc(e.cnpj_beneficiario || "")}</nrInsc></ideContri>
  <ideBenef><cpfBenef>${esc(e.cnpj_prestador || "")}</cpfBenef>
    <idePgto><natRend>${esc(e.cod_receita || "56")}</natRend>
      <infoPgto><dtFG>${esc(e.data_emissao || "")}</dtFG><vlrRendBruto>${fmt(e.vr_bruto)}</vlrRendBruto>
        <vlrIR>${fmt(e.vr_ret_ir)}</vlrIR><vlrCSLL>${fmt(e.vr_ret_csll)}</vlrCSLL>
        <vlrPIS>${fmt(e.vr_ret_pis)}</vlrPIS><vlrCOFINS>${fmt(e.vr_ret_cofins)}</vlrCOFINS>
      </infoPgto></idePgto></ideBenef>
</evtRetPF>`;
    case "R-2099":
    case "R-4099":
      return `<evtFech${e.event_type === "R-4099" ? "Retencoes" : "Reinf"} Id="${id}">
  <ideEvento><perApur>${esc(comp)}</perApur><tpAmb>2</tpAmb></ideEvento>
</evtFech${e.event_type === "R-4099" ? "Retencoes" : "Reinf"}>`;
  }
}

function buildLoteXml(events: any[], cnpj: string): string {
  return buildReinfLoteXml(events.map(buildEventXml).join("\n"), cnpj);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  try {
    const auth = await requireAuth(req, { roles: ["admin", "manager"] });
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.message }), {
        status: auth.status, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!auth.companyId) {
      return new Response(JSON.stringify({ error: "no_company_scope" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const periodId = String(body.period_id || "");
    const eventTypes: EventType[] = Array.isArray(body.event_types) && body.event_types.length
      ? body.event_types
      : ["R-2010", "R-2020", "R-4020", "R-2099", "R-4099"];
    if (!periodId) {
      return new Response(JSON.stringify({ error: "period_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch period + verify tenant
    const { data: period, error: pErr } = await admin
      .from("reinf_periods").select("*").eq("id", periodId).maybeSingle();
    if (pErr || !period) {
      return new Response(JSON.stringify({ error: "period_not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (period.company_id !== auth.companyId) {
      return new Response(JSON.stringify({ error: "forbidden_tenant" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Certificado e senha devem pertencer à empresa ativa; nunca usar A1 global.
    const { certificate: certB64, password: certPass } = tenantReinfCertificateSecrets(
      (name) => Deno.env.get(name), auth.companyId,
    );
    const { data: company } = await admin
      .from("companies").select("cnpj").eq("id", auth.companyId).maybeSingle();
    const env: "simulated" | "sandbox" = certB64 ? "sandbox" : "simulated";

    const { data: events } = await admin
      .from("reinf_events").select("*")
      .eq("period_id", periodId).in("event_type", eventTypes);
    const evs = events || [];
    if (evs.length === 0) {
      return new Response(JSON.stringify({ error: "no_events_to_transmit" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!company?.cnpj || !normalizeValidReinfCnpj(company.cnpj)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_company_cnpj", message: "CNPJ da empresa ausente ou inválido; nenhum lote foi transmitido." }), {
        status: 422, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const xml = buildLoteXml(evs, company.cnpj);

    // Sandbox mode — cert detectado: assina XMLDSig e (opcionalmente) POST SOAP.
    if (env === "sandbox") {
      let signedXml = "";
      let certSubject = "";
      let certExpiry = "";
      try {
        const signed = signReinfXml(xml, certB64!, certPass || "");
        signedXml = signed.signedXml;
        certSubject = signed.cert.subject;
        certExpiry = signed.cert.not_after;
        const certificatePolicy = validateReinfCertificate(signed.cert, company.cnpj);
        if (certificatePolicy !== "valid") {
          return new Response(JSON.stringify({ ok: false, error: certificatePolicy, message: "Certificado A1 não corresponde ao CNPJ da empresa ou está fora da validade. Nenhum lote foi transmitido." }), {
            status: 422, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      } catch (sigErr) {
        console.error("[reinf-transmit] sign_failed", (sigErr as Error).message);
        const { data: row } = await admin.from("reinf_transmissions").insert({
          company_id: auth.companyId, period_id: periodId,
          event_type: "LOTE", env, status: "error",
          payload_xml: xml, events_count: evs.length,
          error: "sign_failed: verifique certificado A1 e senha do tenant.",
          created_by: auth.userId,
        }).select().single();
        return new Response(JSON.stringify({ ok: false, env, transmission: row, message: "Falha na assinatura XMLDSig." }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const endpoint = Deno.env.get("REINF_WS_ENDPOINT"); // opcional — sem ele não bate rede externa
      if (!endpoint) {
        const { data: row } = await admin.from("reinf_transmissions").insert({
          company_id: auth.companyId, period_id: periodId,
          event_type: "LOTE", env, status: "signed",
          payload_xml: signedXml, events_count: evs.length,
          error: `assinado com sucesso (subject=${certSubject}, expira=${certExpiry}). POST SOAP desativado (defina REINF_WS_ENDPOINT).`,
          created_by: auth.userId,
        }).select().single();
        return new Response(JSON.stringify({
          ok: false, env, mode: "signed_only", events_count: evs.length,
          message: "XML assinado e armazenado, mas não transmitido. Configure REINF_WS_ENDPOINT.",
          cert: { subject: certSubject, not_after: certExpiry }, transmission: row,
        }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // POST SOAP homologação
      const soapEnvelope =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
        `<soap:Body>${signedXml.replace(/<\?xml[^?]*\?>\s*/i, "")}</soap:Body></soap:Envelope>`;
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
          body: soapEnvelope,
        });
        const respText = await resp.text();
        const protocol = respText.match(/<nrProtocolo>([^<]+)<\/nrProtocolo>/)?.[1] ?? null;
        // HTTP 2xx alone does not prove acceptance by the fiscal authority.
        const received = resp.ok && Boolean(protocol);
        // The receipt protocol proves transport only, not fiscal authorization.
        const status: "sent" | "rejected" = received ? "sent" : "rejected";
        const { data: row } = await admin.from("reinf_transmissions").insert({
          company_id: auth.companyId, period_id: periodId,
          event_type: "LOTE", env, status, protocol,
          payload_xml: signedXml, response_xml: respText.slice(0, 32000),
          events_count: evs.length, transmitted_at: new Date().toISOString(),
          error: received ? null : `Resposta sem protocolo de recebimento (HTTP ${resp.status}).`,
          created_by: auth.userId,
        }).select().single();
        return new Response(JSON.stringify({
          ok: received, env, protocol, status,
          message: received ? "Lote enviado; processamento fiscal ainda não confirmado." : "Resposta sem protocolo de recebimento.",
          http_status: resp.status,
          cert: { subject: certSubject, not_after: certExpiry }, transmission: row,
        }), { status: received ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
      } catch (netErr) {
        console.error("[reinf-transmit] soap_failed", (netErr as Error).message);
        const { data: row } = await admin.from("reinf_transmissions").insert({
          company_id: auth.companyId, period_id: periodId,
          event_type: "LOTE", env, status: "error",
          payload_xml: signedXml, events_count: evs.length,
          error: "soap_failed: endpoint indisponível.",
          created_by: auth.userId,
        }).select().single();
        return new Response(JSON.stringify({ ok: false, env, transmission: row, message: "Endpoint SOAP indisponível." }), {
          status: 502, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // No certificate: do not persist a fictitious transmission or protocol.
    return new Response(JSON.stringify({
      ok: false, env: "unavailable",
      message: "Certificado A1 não configurado. Nenhum evento foi transmitido ou protocolado.",
    }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[reinf-transmit]", (err as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
