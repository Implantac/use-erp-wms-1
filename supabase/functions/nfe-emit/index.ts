// Server-side fiscal safety gate. Previous NF-e generator covered only a subset
// of operations and omitted the current RTC groups; UI blocking alone is not
// sufficient because this Edge Function can be called directly with a payload.
// Restore emission only after per-model fiscal sign-off, official catalog imports,
// current XSD validation, signing and real SEFAZ homologation tests.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "fiscal_emission_not_homologated" }), {
    status: 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
