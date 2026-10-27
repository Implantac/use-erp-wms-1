#!/usr/bin/env node
// ============================================================================
// USE ERP (local) — gera o arquivo .env.local com segredos novos.
// Uso:  node docker/local/scripts/generate-env.mjs [--force]
// - NUNCA sobrescreve um .env.local existente sem --force (os segredos são a
//   identidade da instalação: trocar JWT_SECRET/POSTGRES_PASSWORD depois do
//   primeiro uso invalida sessões e pode travar o banco já populado).
// - Não precisa de nenhuma dependência (só Node >= 18).
// ============================================================================
import { randomBytes, createHmac } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const target = resolve(root, ".env.local");
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log("• .env.local já existe — mantido (use --force só numa instalação nova, com o banco vazio).");
  process.exit(0);
}

const hex = (bytes) => randomBytes(bytes).toString("hex");
const base64 = (bytes) => randomBytes(bytes).toString("base64").replace(/=+$/, "");

const jwtSecret = hex(32); // 64 chars
function signJwt(role) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    role,
    iss: "supabase-local",
    iat: now,
    // 10 anos — instalações locais não têm rotação automática de chave.
    exp: now + 10 * 365 * 24 * 60 * 60,
  });
  const sig = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const dashboardPassword = base64(18);

const content = `# ============================================================================
# USE ERP — instalação LOCAL (gerado em ${new Date().toISOString()})
# NAO compartilhe este arquivo: ele contém os segredos desta instalação.
# Para mudar a URL pública (rede local), ajuste SUPABASE_PUBLIC_URL/SITE_URL
# para http://<IP-DESTA-MAQUINA>:8080 e recrie os containers (install de novo).
# ============================================================================

# --- Acesso web (única porta que precisa ser liberada no firewall) ---
WEB_PORT=8080
SUPABASE_PUBLIC_URL=http://localhost:8080
SITE_URL=http://localhost:8080
PUBLIC_APP_URL=http://localhost:8080
ADDITIONAL_REDIRECT_URLS=http://localhost:8080/**,http://127.0.0.1:8080/**

# --- Banco de dados PostgreSQL local ---
POSTGRES_PASSWORD=${hex(24)}
POSTGRES_DB=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# --- Auth / API (chaves geradas só para esta instalação) ---
JWT_SECRET=${jwtSecret}
ANON_KEY=${signJwt("anon")}
SERVICE_ROLE_KEY=${signJwt("service_role")}
JWT_EXPIRY=3600
SECRET_KEY_BASE=${base64(48)}
REALTIME_DB_ENC_KEY=${hex(8)}
VAULT_ENC_KEY=${hex(16)}
PG_META_CRYPTO_KEY=${base64(24)}
S3_PROTOCOL_ACCESS_KEY_ID=${hex(16)}
S3_PROTOCOL_ACCESS_KEY_SECRET=${hex(32)}
CRON_SECRET=${hex(32)}

# Cadastro aberto com confirmação automática (não há servidor de e-mail local;
# convites por e-mail só funcionam se você configurar um SMTP nas Edge Functions).
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=localhost
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=USE ERP Local
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# --- Painel de banco (Supabase Studio, opcional — perfil "studio") ---
# Acesso: http://localhost:3000  (usuário abaixo; guarde a senha!)
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${dashboardPassword}
STUDIO_DEFAULT_ORGANIZATION=USE ERP Local
STUDIO_DEFAULT_PROJECT=USE ERP

# --- API / Storage ---
PGRST_DB_SCHEMAS=public,graphql_public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public
GLOBAL_S3_BUCKET=stub
REGION=stub
STORAGE_TENANT_ID=stub
IMGPROXY_AUTO_WEBP=true
FUNCTIONS_VERIFY_JWT=false

# ============================================================================
# OPCIONAL — integrações externas (deixe vazio para rodar 100% offline;
# a função correspondente responde "indisponível", sem simular sucesso)
# ============================================================================
ALLOWED_ORIGINS=
LOVABLE_API_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
INCIDENT_EMAIL_FROM=
COMMERCE_NOTIFY_FROM=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BILLING_WEBHOOK_SECRET=
PSP_WEBHOOK_SECRET=
PIX_WEBHOOK_SECRET=
PIX_SIMULATION_ENABLED=
SEFAZ_MTLS_PROXY_URL=
SEFAZ_MTLS_PROXY_TOKEN=
SEFAZ_WEBHOOK_SECRET=
REINF_WS_ENDPOINT=
RFID_WEBHOOK_SECRET=
RFID_WEBHOOK_API_KEY=
BRAIN_WEBHOOK_URL=
`;

writeFileSync(target, content, { mode: 0o600 });
console.log("✔ .env.local gerado com segredos novos.");
console.log(`  Painel do banco (Studio, opcional): usuário "supabase" / senha "${dashboardPassword}"`);
console.log("  Guarde essa senha — ela também fica salva dentro do .env.local (DASHBOARD_PASSWORD).");
