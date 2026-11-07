# Homologação como código — QA-06

**Data:** 07/11/2026 · **Status:** 🟡 **PROPOSTA REVISÁVEL — NÃO EXECUTADA** · **Produção: NO-GO**

## 0. O que esta rodada entregou (e o que não entregou)

O repositório **já tinha** um ambiente completo como código. Não foi criada uma
stack paralela: a entrega é uma **auditoria**, um **overlay de segurança**, um
**bootstrap não executado** e um **validador estático com testes**.

| Entregue | Não entregue (depende do responsável) |
| --- | --- |
| Auditoria de `docker-compose.local.yml` e `Dockerfile.local` | Nenhum container foi criado |
| `docker-compose.homologacao.yml` (overlay, reutiliza o base) | Nenhuma migration aplicada em banco real |
| `bootstrap.sh` com pré-voo e teardown obrigatório | Nenhum segredo real gerado ou cadastrado |
| `homologacao.env.example` (só nomes) | Nenhum dos 18 segredos do GitHub configurado |
| `scripts/validate-homologacao-compose.mjs` + testes | Nenhum teste de navegador executado |
| `docs/HOMOLOGACAO-LOCAL.md` corrigido (504 migrations) | Nenhum deploy, piloto ou aceite |

O sandbox desta rodada **não tem Docker** (`command -v docker` vazio). Toda
validação feita aqui é **estática** (`node --test`, YAML, SEC-02, `diff --check`)
mais a suíte isolada já existente. **Não declare este ambiente como funcional.**

## 1. Topologia reaproveitada

`docker-compose.local.yml` já sobe, na rede interna do Docker:

```
web (nginx :8080) ─ /              → frontend estático (dist)
                  ├ /rest/v1/      → rest      (PostgREST v14.18)
                  ├ /auth/v1/      → auth      (GoTrue v2.197.0)
                  ├ /realtime/v1/  → realtime  (v2.143.3)
                  ├ /storage/v1/   → storage   (+ imgproxy)
                  └ /functions/v1/ → functions (Edge Runtime/Deno)
db      → supabase/postgres:15.8.1.085 (pg_cron, pg_net, schemas Supabase)
migrate → 504 migrations + baseline + patches + 99-local-final.sql
```

O `Dockerfile.local` faz o build com `VITE_*` **vazios de propósito**, e
`docker/local/web/40-useerp-config.sh` **reescreve** `/config.js` na subida com
a `ANON_KEY` local. O app resolve a URL pela própria origem
(`window.location.origin`), e o nginx proxya a API. Isso é o que impede a
homologação de falar com a publicação no Lovable.

## 2. Achados da auditoria (sem alterar o compose base)

| # | Achado | Risco | Tratamento no overlay |
| --- | --- | --- | --- |
| A-01 | `web.ports` = `"${WEB_PORT:-8080}:80"` → **`0.0.0.0:8080`** | Ambiente de teste exposto na rede local | `ports: !reset ["127.0.0.1:…:80"]` |
| A-02 | `ports` é opção **concatenada** no Compose | Acrescentar a porta de loopback deixaria as **duas** ativas | `!reset` (exige Compose ≥ 2.24.4) |
| A-03 | `functions.image: useerp-functions-local:latest` | Tag mutável; relatório de aceite não identifica a imagem | `image: useerp-functions-homologacao:local` |
| A-04 | `restart: unless-stopped` em todos os serviços | Containers ressuscitam após o teardown e reaproveitam banco sujo | `restart: "no"` |
| A-05 | `public/config.js` versionado aponta para a nuvem publicada | Se o entrypoint não rodar, homologação fala com produção | Entrypoint já sobrescreve; `ANON_KEY` com `:?` falha fechado |
| A-06 | `migrate` aplica migrations, **não** os 3 seeds determinísticos | Sem massa, os 18 segredos de IDs não existem | `bootstrap.sh` aplica os seeds explicitamente |
| A-07 | `docs/HOMOLOGACAO-LOCAL.md` dizia **459 migrations / 94-94 / 11-11** | Documento desatualizado induz aceite falso | Corrigido para **504** e **24 testes isolados** |
| A-08 | Roteiro antigo fixa UUIDs `e2000000-…` no PowerShell | Massa frágil; o isolado já descobre por `code` | Bootstrap falha fechado se algum dos 18 estiver vazio |

**Não foi alterado:** `docker-compose.local.yml`, `Dockerfile.local`,
`40-useerp-config.sh`, `migrate.sh`, `nginx.conf`, `.github/workflows/e2e.yml`,
nenhum grant e nenhuma migration.

## 3. Como usar (na máquina do responsável, com Docker)

```bash
# 1. Gerar segredos NOVOS desta instância (nunca versionar .env.local)
node docker/local/scripts/generate-env.mjs

# 2. Preencher .env.homologacao a partir de homologacao.env.example
#    (nome com ponto: ignorado pelo .gitignore e pelo .dockerignore)
#    Os 18 E2E_* devem vir da massa das seeds, descoberta por SQL — não por UUID fixo.

# 3. Validar sem subir nada
node scripts/validate-homologacao-env.mjs        # pré-voo dos 18
node scripts/validate-homologacao-compose.mjs    # invariantes do overlay
docker compose -f docker-compose.local.yml \
  -f infra/homologacao/docker-compose.homologacao.yml \
  --env-file .env.homologacao config -q

# 4. Bootstrap completo (sobe, migra, semeia, testa e derruba)
bash infra/homologacao/bootstrap.sh
```

O `bootstrap.sh` usa `trap … EXIT` para o `down -v` **mesmo em falha** e exige
`E2E_REQUIRE_ALL=1`, que liga o reporter anti-skip do Playwright.

## 4. Limites — o que este ambiente ainda NÃO resolve

- **`logistic-fiscal-correlation.spec.ts`** clica em "Expedir" e valida rastro
  até rascunho de NF-e: precisa de SEFAZ/proxy mTLS e massa operacional pronta.
- **PSP/PIX, Stripe, e-mail, RFID, IA**: as variáveis do compose ficam vazias
  por padrão; as funções respondem "indisponível". Isso é intencional.
- **3 specs de navegador** (`store-journey-ui`, `logistic-fiscal-correlation`,
  `e2e/tests/navigation.test.ts`) continuam irredutíveis sem este ambiente
  validado de fato.
- **Restore/backup**, rotação de PATs e chave `anon` legada, e **aceite formal**
  (commit, ambiente, data, responsável) permanecem abertos.
- O job autenticado do CI continua ❌ no step 4 pelos **18 segredos**. O gate
  **não** foi removido, reduzido nem ligado a este overlay.

## 5. Critério de saída

Só declarar homologação funcional com evidência publicada de: SHA, ambiente
identificado, data, responsável, `docker compose config -q`, `migrate` sem erro,
504 migrations contadas, seeds aplicados, os 18 segredos configurados de forma
segura, `bun run e2e:critical` com **`skip=0`** e artefatos anexados.
**CI verde não é evidência de aplicação utilizável.**

Documentos relacionados: [HOMOLOGACAO-LOCAL.md](../../docs/HOMOLOGACAO-LOCAL.md),
[E2E-SEGREDOS-E-ROTACAO.md](../../docs/E2E-SEGREDOS-E-ROTACAO.md),
[ADR-QA05-GRANT-REWORK.md](../../docs/ADR-QA05-GRANT-REWORK.md),
[ENVIRONMENT.md](../../docs/ENVIRONMENT.md) §0.2.
