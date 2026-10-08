# SEFAZ mTLS Proxy

Proxy HTTPS mínimo para viabilizar emissão de NFe direta da SEFAZ a partir do edge-runtime Supabase — que **não suporta certificados cliente (mTLS) em `fetch`**. O proxy recebe o SOAP já montado + o `.pfx` em base64 + senha, apresenta o certificado no handshake TLS e devolve a resposta.

## Fluxo

```
Edge (nfe-emit) ──HTTPS+Bearer──► sefaz-mtls-proxy ──HTTPS+mTLS(A1)──► SEFAZ UF
                                          │
                                          └─ nada persistido (cert em memória durante o request)
```

## Rotas

- `GET /health` — liveness.
- `POST /soap` — body JSON:
  ```json
  {
    "endpoint": "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    "soap_action": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
    "headers": {},
    "soap": "<?xml ...>",
    "cert_b64": "<pfx em base64>",
    "cert_password": "senha"
  }
  ```
  Resposta: `{ "status": 200, "body": "<xml>" }`.

Header obrigatório em produção: `Authorization: Bearer $PROXY_TOKEN`.

## Segurança

- `PROXY_TOKEN` obrigatório em produção (`NODE_ENV=production`).
- Hostname da SEFAZ é validado contra whitelist `*.fazenda.*.gov.br` + `receita.fazenda.gov.br`.
- TLS mínimo 1.2, `rejectUnauthorized: true`.
- Cert/senha **nunca** logados. Body limit 4 MB.
- Agente HTTPS é destruído a cada request (sem keep-alive de sessão com certificado).

## Deploy Fly.io

```bash
cd infra/sefaz-mtls-proxy
fly launch --no-deploy --copy-config
fly secrets set PROXY_TOKEN=$(openssl rand -hex 32)
fly deploy
```

## Configuração no ERP

Após deploy, cadastre os secrets no backend Lovable Cloud:

- `SEFAZ_MTLS_PROXY_URL` → `https://<app>.fly.dev/soap`
- `SEFAZ_MTLS_PROXY_TOKEN` → mesmo valor de `PROXY_TOKEN`

Sem `SEFAZ_MTLS_PROXY_URL`, `supabase/functions/_shared/sefaz-transport.ts` falha sem resposta fiscal; não há modo simulado operacional. Mesmo com proxy, emissão e eventos exigem homologação do leiaute, assinatura, resposta oficial e ambiente antes de serem liberados.

## Deploy alternativo (Render / Railway / VPS)

Qualquer host que rode Node 20 e libere egress HTTPS. Exporte `PROXY_TOKEN` e `PORT`, aponte o serviço para `node server.js`.

## Testes locais

```bash
npm install
PROXY_TOKEN=dev npm run dev
curl -X POST http://localhost:8443/soap \
  -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
  -d '{"endpoint":"https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx","soap":"<...>","cert_b64":"<b64>","cert_password":"..."}'
```
