// Reinf — Status do certificado A1 (metadados públicos apenas).
// Nunca retorna PFX, chave privada, senha ou PEM completo.
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/require-auth.ts";
import { inspectCertificate } from "../_shared/reinf-sign.ts";
import { tenantReinfCertificateSecrets } from "../_shared/reinf-tenant-cert.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  try {
    const auth = await requireAuth(req);
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

    const { certificate: certB64, password: certPass } = tenantReinfCertificateSecrets(
      (name) => Deno.env.get(name), auth.companyId,
    );
    const wsEndpoint = Boolean(Deno.env.get("REINF_WS_ENDPOINT"));

    if (!certB64) {
      return new Response(JSON.stringify({
        configured: false,
        ws_endpoint_configured: wsEndpoint,
        mode: "unavailable",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    try {
      const info = inspectCertificate(certB64, certPass || "");
      const now = Date.now();
      const expiryMs = new Date(info.not_after).getTime();
      const daysToExpire = Math.floor((expiryMs - now) / (1000 * 60 * 60 * 24));
      return new Response(JSON.stringify({
        configured: true,
        ws_endpoint_configured: wsEndpoint,
        mode: wsEndpoint ? "live" : "signed_only",
        subject: info.subject,
        issuer: info.issuer,
        not_before: info.not_before,
        not_after: info.not_after,
        days_to_expire: daysToExpire,
        expired: daysToExpire < 0,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (err) {
      console.error("[reinf-cert-status] inspect_failed", (err as Error).message);
      return new Response(JSON.stringify({
        configured: true, valid: false,
        error: "cert_or_password_invalid",
        ws_endpoint_configured: wsEndpoint,
      }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[reinf-cert-status]", (err as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
