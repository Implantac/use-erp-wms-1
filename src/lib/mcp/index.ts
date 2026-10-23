import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import searchProductsTool from "./tools/search-products";
import listPayablesTool from "./tools/list-payables";
import listOrdersTool from "./tools/list-orders";
import getOrderTool from "./tools/get-order";

// O issuer OAuth precisa ser o host direto supabase.co (mcp-js valida contra o
// documento de discovery — RFC 8414 §3.3). Nunca usar SUPABASE_URL (pode ser
// proxy .lovable.cloud). O project ref é o único valor que sobrevive a publish
// e o Vite inlina como literal no build (mantém o entry import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";
// Instalação local (sem project ref da nuvem): aponta o issuer para o Auth
// local servido na mesma origem. Na nuvem o comportamento é idêntico ao anterior.
const issuer = import.meta.env.VITE_SUPABASE_PROJECT_ID
  ? `https://${projectRef}.supabase.co/auth/v1`
  : `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`;

export default defineMcp({
  name: "use-sistemas-erp-mcp",
  title: "Use Sistemas ERP",
  version: "0.1.0",
  instructions:
    "Ferramentas do ERP Use Sistemas (multi-tenant, RLS por empresa). " +
    "Use `whoami` para confirmar o usuário conectado. " +
    "Use `search_products` para consultar o cadastro de produtos. " +
    "Use `list_payables` para revisar contas a pagar por status e vencimento. " +
    "Use `list_orders` para consultar pedidos comerciais por status e intervalo de datas. " +
    "Use `get_order` para obter um pedido específico (com itens) pelo seu UUID. " +
    "Todas as consultas respeitam o escopo de empresa do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, searchProductsTool, listPayablesTool, listOrdersTool, getOrderTool],
});
