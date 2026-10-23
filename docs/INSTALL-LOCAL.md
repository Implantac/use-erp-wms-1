# USE ERP — Instalação 100% local (PostgreSQL local, sem nuvem)

Versão do sistema para rodar **inteira na sua máquina/servidor**, com o banco
**PostgreSQL local**. Nada de conta no Supabase, nada de banco na nuvem:
o login, a API, o realtime, os arquivos e as funções de servidor rodam em
containers Docker ao lado do banco — a mesma tecnologia da nuvem
(Supabase self-hosted), só que dentro da sua rede.

> **Para quem é:** Windows com Docker Desktop, sistema acessível pelos outros
> computadores da **rede local**, funcionando mesmo sem internet depois da
> primeira instalação. As integrações externas (IA, NF-e/SEFAZ, Pix, e-mails)
> são **opcionais**: sem chave configurada, o recurso responde “indisponível”
> e o restante do ERP/WMS segue operando.

---

## Instalação em 1 clique (Windows)

Extraia o projeto, abra a pasta e dê **duplo clique em `INSTALAR-TUDO.bat`**:
ele confere/abre o Docker Desktop, gera os segredos, sobe a stack, aplica as
459 migrations, pergunta se cadastra a BIL e abre o navegador. Para ligar e
desligar depois, use `INICIAR-SISTEMA.bat` e `PARAR-SISTEMA.bat`. Os passos
manuais equivalentes estão no restante deste documento.

## 1. O que vai ser instalado

| Container | O que é | Porta |
|---|---|---|
| `useerp-web` | Sistema (frontend) + porta de entrada da API | **8080** (única liberada na rede) |
| `useerp-db` | **PostgreSQL 15 local** (dados da empresa) | 5432, só na própria máquina |
| `useerp-auth` | Login/usuários (GoTrue) | interna |
| `useerp-rest` | API de dados (PostgREST) com as mesmas regras (RLS) da nuvem | interna |
| `realtime-dev.supabase-realtime` | Atualizações em tempo real | interna |
| `useerp-storage` + `useerp-imgproxy` | Arquivos/anexos | interna |
| `useerp-functions` | 53 funções de servidor (Edge Functions/Deno) | interna |
| `useerp-migrate` | Aplica as migrations no banco (roda e sai) | — |
| `useerp-studio` (opcional) | Painel visual do banco | 3000, só na própria máquina |

Tudo conversa por uma rede interna do Docker. Para quem usa, é **um endereço
só**: `http://<IP-DA-MAQUINA>:8080`. Como o sistema e a API saem pela mesma
origem, o mesmo sistema funciona em `localhost` e pelo IP da rede sem
precisar recompilar nada.

### Arquivos desta versão

| Arquivo/pasta | Papel |
|---|---|
| `docker-compose.local.yml` | A stack inteira (banco + Supabase local + frontend) |
| `instalar-local.ps1` / `instalar-local.sh` | Instalador (Windows / Linux-macOS) |
| `backup-local.ps1` / `restaurar-local.ps1` (+ `.sh`) | Backup e restauração do banco |
| `.env.local` (gerado, **secreto**) | Senhas e chaves desta instalação — **não compartilhe, não commite** |
| `.env.local.example` | Referência das variáveis |
| `Dockerfile.local` + `docker/local/nginx.conf` | Frontend que também é a porta de entrada da API |
| `docker/local/scripts/migrate.sh` | Aplica as migrations do diretório (459 arquivos atualmente) 1x e reaponta os agendamentos |
| `docker/local/scripts/generate-env.mjs` | Gera os segredos (usado no Linux/macOS; o `.ps1` gera sozinho no Windows) |
| `docker/local/volumes/` | Scripts oficiais de inicialização do Supabase self-hosted |
| `src/integrations/supabase/config.ts` | Resolve URL/chave em tempo de execução (nuvem continua igual) |

---

## 2. Instalação no Windows (passo a passo)

### 2.1 Pré-requisito: Docker Desktop

1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   (na instalação, mantenha a opção **WSL 2** marcada).
2. Abra o Docker Desktop e espere o ícone ficar “rodando” (verde).
3. Recomendado: em *Settings → Resources*, reserve pelo menos **4 GB de RAM**
   (o conjunto banco + funções usa ~1,5–2,5 GB em uso normal).

> Sem Docker também dá? A versão local foi feita para Docker justamente para
> o PostgreSQL já vir com as extensões que o sistema usa (pg_cron, pg_net,
> schemas de auth/storage). Instalação “na mão” não é suportada nesta versão.

### 2.2 Instalar o sistema

Abra o **PowerShell** na pasta do projeto e rode:

```powershell
.\instalar-local.ps1
```

Se o Windows bloquear o script: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` e rode de novo.

O instalador:

1. Confere o Docker;
2. Gera o `.env.local` com **segredos novos** (senha do banco, chaves de API, senha do painel);
3. Pergunta qual IP os outros computadores vão usar (escolha o IP da sua rede, ex. `192.168.0.10`) e tenta liberar a porta **8080** no Firewall do Windows (perfil *Privado*);
4. Baixa as imagens, constrói o frontend e sobe tudo;
5. Aplica as **459 migrations atuais** no PostgreSQL local e reaponta os agendamentos (pg_cron) que nasceram apontando para a nuvem antiga;
6. Testa `http://localhost:8080` e mostra os endereços.

Na primeira vez demora (download das imagens + build + migrations). Nas
próximas, o mesmo comando só atualiza o que mudou — ele **nunca** apaga os
dados nem troca os segredos sozinho.

### 2.3 Primeiro acesso

1. Abra `http://localhost:8080` (nesta máquina) ou `http://<IP>:8080` (outros PCs da rede).
2. Crie a primeira conta na **tela de cadastro** — sem servidor de e-mail local, ela já nasce confirmada.
3. Complete o assistente de empresa. Essa conta é o seu administrador local; convide os demais em *Administração → Usuários*.

> ⚠️ **Auditoria recomendada antes de usar com dados reais:** acesse as
> orientações já existentes do projeto em `docs/INSTALL.md` e
> `scripts/audit-legacy-support-privileges.sql` — migrations históricas
> criam empresa padrão e uma conta de suporte legada que devem ser revisadas.

### 2.4 Cadastro da BIL Importação e Exportação LTDA

Para deixar a instalação já com a BIL cadastrada e com **todos os acessos
de produção liberados**, rode no PowerShell:

```powershell
$env:BIL_ADMIN_PASSWORD = '<senha-inicial-do-admin>'
.\cadastrar-bil.ps1 -Email etcsuporte889@gmail.com
```

No Linux/macOS: `./cadastrar-bil.sh` (ele pergunta a senha sem mostrá-la,
se `BIL_ADMIN_PASSWORD` não estiver definida).

O script é idempotente (pode rodar de novo) e grava:

- usuário administrador informado, com e-mail confirmado;
- **Bil Importação e Exportação LTDA**, CNPJ **30.965.938/0001-07**, endereço
  Rodovia Antonio Heil, 14955, Galpão 02, Brilhante I, Itajai/SC, CEP 88318-251;
- segmento **Têxtil integrada**, ramos **Tecelagem e tinturaria** e regime
  tributário **Lucro Real**;
- filial **Matriz** como unidade industrial (`ATACADO_INDUSTRIA`), condição
  para abrir Produção/PCP e WMS;
- plano **Enterprise** ativo até 2099, com todos os módulos e permissões
  (incluindo Produção, PCP, MRP, APS, Qualidade, WMS e Fiscal) para o papel
  `admin` e para o administrador da BIL.

Depois, entre com esse usuário e **troque a senha inicial**. Para conferir o
que foi gravado, o resumo impresso ao final de `cadastrar-bil.ps1/.sh` lista
empresa, filial, plano, assinatura e quantidade de módulos liberados.

### 2.5 Rede local (vários computadores)

- Deixe esta máquina com **IP fixo** (no roteador, por reserva DHCP, ou IP estático no Windows) — se o IP mudar, o endereço de acesso muda junto.
- Outros PCs acessam `http://<IP-FIXO>:8080`. Não precisa instalar nada neles.
- A porta do banco (5432) **não** é exposta na rede — só o próprio servidor a alcança (e você, via `localhost:5432`, com DBeaver/psql usando a senha do `.env.local`).

---

## 3. Uso no dia a dia

```powershell
# Status / logs
docker compose -f docker-compose.local.yml --env-file .env.local ps
docker compose -f docker-compose.local.yml --env-file .env.local logs -f

# Parar (mantém todos os dados) / subir de novo
docker compose -f docker-compose.local.yml --env-file .env.local down
.\instalar-local.ps1            # ou: docker compose ... up -d

# Painel visual do banco (opcional) — http://localhost:3000
docker compose -f docker-compose.local.yml --env-file .env.local --profile studio up -d
# usuário/senha: DASHBOARD_USERNAME / DASHBOARD_PASSWORD do .env.local
```

**Ao ligar o PC, o sistema volta sozinho?** Os containers têm
`restart: unless-stopped` — basta o Docker Desktop estar configurado para
iniciar com o Windows (*Settings → General → Start Docker Desktop when you
sign in*).

## 4. Backup e restauração

```powershell
.\backup-local.ps1        # gera backups\useerp-<data-hora>.dump + cópia do .env.local
.\restaurar-local.ps1 backups\useerp-<data-hora>.dump
```

- Guarde a pasta `backups/` **fora desta máquina** também.
- Anexos/arquivos (Storage) ficam no volume Docker `useerp-local_storage-data` — o comando para exportá-lo aparece ao final do script de backup.
- ⚠️ **Nunca** rode `docker compose down -v`: o `-v` apaga os volumes (banco + arquivos).

## 5. Integrações externas (opcional, desligadas por padrão)

O ERP/WMS funciona 100% local sem nenhuma chave. Para ligar um recurso
externo, preencha a variável no `.env.local` e recrie os containers
(`docker compose ... up -d functions web`):

| Variável | Recurso |
|---|---|
| `LOVABLE_API_KEY` / `OPENAI_API_KEY` | Módulos de IA (`ai-*`, `cx-*`, NPS-IA) |
| `RESEND_API_KEY` + `INCIDENT_EMAIL_FROM` / `COMMERCE_NOTIFY_FROM` | E-mails transacionais |
| `SEFAZ_MTLS_PROXY_URL` / `SEFAZ_MTLS_PROXY_TOKEN` | Emissão fiscal (proxy mTLS) |
| `STRIPE_*`, `PSP_WEBHOOK_SECRET`, `PIX_WEBHOOK_SECRET` | Cobrança/Pix |
| `RFID_*`, `BRAIN_WEBHOOK_URL`, `REINF_WS_ENDPOINT` | RFID, webhooks, EFD-Reinf |

Sem a chave, a função correspondente responde indisponível — **nunca simula
sucesso** (mesmo comportamento da nuvem; ver `docs/ENVIRONMENT.md`).
Na primeira subida, as Edge Functions baixam dependências de `esm.sh`:
**a primeira instalação precisa de internet**; depois disso o cache fica no
volume `deno-cache` e a rede local opera offline (exceto os recursos da
tabela acima, quando você os ligar).

> Webhooks externos (Pix/SEFAZ) precisam **chegar** até esta máquina — numa
> rede local sem endereço público, eles não chegam. Para recebê-los, exponha
> apenas `http://<sua-url>/functions/v1/...` via túnel/domínio com HTTPS.

## 6. Atualizando o sistema

```powershell
git pull
.\instalar-local.ps1    # rebuilda o frontend e aplica só as migrations novas
```

O controle de migrations (`supabase_migrations.schema_migrations`) é o mesmo
da nuvem: o que já foi aplicado é pulado; se uma migration nova falhar, o
instalador para nela e retoma dali na próxima execução.

## 7. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| “Docker não respondeu” | Docker Desktop fechado ou ainda subindo. Abra e espere ficar verde. |
| Outro PC não abre o sistema | IP errado/mudou, firewall na porta 8080 não liberado, ou PC fora da rede privada. Teste `http://localhost:8080` no servidor. |
| Tela abre, login não entra | Containers `auth`/`rest` ainda subindo (`... logs -f auth rest`) ou migrations não aplicadas (rode o instalador de novo). |
| Cadastro de empresa cai no login ou dá 404 | Atualize o frontend (a rota `/onboarding` precisa existir fora do layout protegido) e reaplique as migrations para o `99-local-final.sql` corrigir `bootstrap_tenant`. |
| `migrate` parou numa migration | O erro aparece no log; corrija a causa e rode o instalador — ele retoma da migration que falhou. |
| Porta 8080 ocupada | Mude `WEB_PORT` no `.env.local` (ex.: 8081) e rode o instalador. |
| Build do frontend morre por falta de memória | Aumente a RAM do Docker Desktop para 6 GB (*Settings → Resources*) e rode o instalador de novo; o build já pede heap de até 4 GB (`NODE_OPTIONS` no `Dockerfile.local`). |
| Apaguei `.env.local` | Gere segredos novos só vale para instalação **vazia**. Com banco populado, restaure a cópia guardada pelo backup. |
| Função de IA/fiscal “indisponível” | Esperado sem a chave (seção 5). |

## 8. Correções que a instalação local aplica (e por quê)

Montar um banco **só a partir das migrations** expôs problemas que na
nuvem estavam mascarados por objetos/dados criados fora do histórico. A
instalação local **não edita as migrations** (exceto os itens 8.3): ela roda
um baseline antes, patches pontuais e ajustes finais — todos em
`docker/local/scripts/`, idempotentes e comentados um a um.

### 8.1 Baseline (`00-baseline.sql`, antes de tudo)
Cria, se não existirem, o enum `app_role` (`admin/manager/operator/viewer`),
a tabela `user_roles` e `has_role(uuid, app_role)` — o template inicial de
RBAC que a migration `20260309001236` já presume existir (nenhuma migration
os cria; dezenas os usam).

### 8.2 Patches (`scripts/patches/before|after-<versão>.sql`)
| Patch | Problema em banco vazio |
|---|---|
| `before-20260603145513` | A migration cria a “Empresa Padrão” sem CNPJ, mas `companies.cnpj` é NOT NULL. Semeamos a mesma empresa antes. |
| `before-20260626003808` | `cron.unschedule` de jobs que só existiam na nuvem (erro no pg_cron). Criamos jobs inertes só para serem removidos. |
| `before/after-20260630201649` | Correção de dados para o UUID da conta de suporte da nuvem (FK quebra local). Usamos um usuário *stub* sem senha durante a migration e o apagamos logo depois — **a conta de suporte não é recriada**. |
| `before-20260804000000` | Trigger sobre `public.stock_transfers`, tabela que não existe no schema final. Criamos a tabela vazia, com RLS e sem acesso. |
| `before-20260804151344` | Insere módulos com `plan_id` do plano `enterprise`, que não existia local. Semeamos o plano (sem atribuir a ninguém). |
| `before-20260807120000` | F7 presume `permissions.name`, mas a tabela (20260625164317) tem outro desenho. Adicionamos a coluna nullable/única. |
| `before-20260807122522` | `idempotency_keys` com dois desenhos conflitantes no histórico. Convertemos para o desenho final (o que `_shared/idempotency.ts` usa). |
| `before-20261013220000` | FK `route_id` (text) → `production_routes.id` (uuid) é recusada. Convertemos a coluna para uuid. |

### 8.3 Duas migrations com erro de sintaxe (corrigidas no arquivo)
Dois arquivos tinham SQL **sintaticamente inválido em qualquer Postgres**
(nunca puderam ser aplicados como estavam) e foram corrigidos com um
caractere/parênteses, com comentário `[Correcao instalacao local]` no local:
`20260807000001` (um `)` excedente numa policy) e `20261015000100`
(`CASE` sem parênteses dentro de `IF` no PL/pgSQL). Semântica inalterada.

### 8.4 Ajustes finais (`99-local-final.sql`, a cada instalação)
1. **Grants das RPCs do frontend para `authenticated`.** A migration
   `20260803182747` (“Massive Revoke”) revogou EXECUTE de tudo fora de uma
   whitelist — inclusive `bootstrap_tenant` e 46 das 78 RPCs que as telas
   chamam via `supabase.rpc(...)`. Devolvemos EXECUTE só dessas 78 (menos
   as 2 que nem existem no banco), pois são SECURITY DEFINER e validam a
   empresa do chamador internamente.
2. **Plano `starter`** (trial de 14 dias que o onboarding procura).
3. **`bootstrap_tenant` corrigido**: gravava `branches.address_zip_code`,
   coluna que não existe (o certo é `address_zip`). Função recriada igual,
   trocando essa coluna e gravando o tipo/canal da Matriz conforme o
   segmento (indústria/CD/filial) — com o padrão “loja”, o guard de
   contexto bloquearia Produção e WMS da empresa recém-cadastrada.
4. **Guardas de tenant liberando o onboarding**: as guardas de profile/
   `user_roles` bloqueavam até o cadastro da primeira empresa (o papel
   admin só é inserido depois da atualização do profile). A exceção é um
   sinalizador que só o `bootstrap_tenant` liga dentro da própria
   transação — UPDATE direto do usuário continua bloqueado.
5. **`profiles.branch_id` → `branches`**: a FK apontava para `companies`
   (resquício de quando filial era empresa) e quebrava o vínculo da Matriz.

### 8.5 Validação feita nesta versão
Testado de verdade (PostgreSQL 15 + Auth + PostgREST + Realtime + Storage +
Edge Runtime oficiais, nesta ordem): banco vazio → **451/451 migrations
aplicadas na validação original** → cadastro de usuário (confirmação automática) → login →
`bootstrap_tenant` criando empresa/filial/papel admin/assinatura trial →
insert e leitura de produto pelo dono → **outro usuário não enxerga o
produto** (RLS) → Edge Function `health-check` executando e consultando o
banco → frontend servido na mesma origem com login e dados funcionando.
`npm run typecheck` limpo; testes unitários 236/237 (a única falha é um
teste de integração que já falhava antes, por exigir a nuvem ao vivo).

> Duas RPCs chamadas pelo frontend não existem no banco
> (`convert_quotation_to_purchase_order`, `get_wms_slotting_suggestions`) —
> as telas correspondentes retornam erro, como retornariam num banco
> montado do histórico em qualquer ambiente.

## 9. Diferenças para a nuvem (transparência)

- **Banco é o mesmo** (PostgreSQL + RLS + `auth.uid()` + pg_cron/pg_net) — por isso as migrations aplicam sem reescrever o sistema.
- **E-mails de confirmação**: desligados (autoconfirmação ligada). Convites por e-mail dependem de SMTP/Resend configurado.
- **Agendamentos**: os `pg_cron` que chamavam a nuvem antiga são reapontados para `http://functions:9000` na instalação. Algumas *funções PL/pgSQL históricas* ainda têm a URL antiga no corpo — o instalador as lista no log (“Auditoria”) sem reescrevê-las; os gatilhos afetados falham em silêncio (pg_net é assíncrono) e não travam o ERP.
- **MCP/OAuth**: na nuvem usa o issuer `*.supabase.co`; localmente o MCP fica limitado ao issuer local.
- **HTTPS**: na rede local é HTTP. Para qualquer acesso fora da rede da empresa, ponha um proxy com HTTPS na frente (não exponha o 8080 direto na internet).

## 10. Atualização 19/10/2026 — PCP têxtil e limite de homologação

- O repositório tem agora **459 migrations**. As de 2026-10-19 implementam a conclusão transacional de OP e o PCP de tecelagem (snapshot, reservas, capacidade finita, etapas, qualidade, genealogia e compra MRP) e quatro correções obrigatórias para o uso diário: default de `products.item_kind`, replica identity de `stock_balances`, trigger de alerta de atraso (uuid=text) e remoção do trigger legado de conclusão automática.
- Essas duas migrations foram aprovadas em PostgreSQL embarcado isolado e pelos testes permanentes do repositório, mas **ainda não foram aplicadas nesta stack Docker completa**. A validação 451/451 da seção 8.5 é anterior a elas; rode o instalador para aplicá-las e trate qualquer falha como bloqueio, sem marcar a migration como aplicada.
- Depois de subir a stack, cadastre a BIL com `cadastrar-bil.ps1`/`.sh` e homologue a jornada de tecelagem com a fixture e as variáveis descritas em `docs/INDUSTRIAL_TEXTILE_GUIDE.md` antes de usar dados reais de produção.

## Fluxo de teste têxtil (dados funcionais)

Com a BIL cadastrada, dê duplo clique em **`PREPARAR-FLUXO-TESTE.bat`** para preencher o sistema com um ciclo completo e navegável, executado pelas funções reais: cliente e pedido `PV-TESTE-0001` → pluma classificada em 2 lotes → fiação (93 kg de fio 30) → malharia (87 kg de malha crua) → tinturaria (75 kg de malha tingida) → estoque, com programação, qualidade aprovada, genealogia e custo. É idempotente (rodar de novo não duplica) e serve para homologar as telas de Comercial, PCP, Qualidade e Estoque antes do uso real.
