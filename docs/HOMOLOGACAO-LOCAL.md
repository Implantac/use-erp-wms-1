# Roteiro de homologação local — USE ERP-WMS (produção têxtil)

Sequência exata para sair de "comprovado em harness isolado" para **homologado
na sua máquina**. Marque cada etapa só com a evidência indicada ao lado.
Pré-requisito: Windows com Docker Desktop (WSL2) e **6 GB de RAM** alocados
(Settings → Resources), porque o build web usa heap de até 4 GB.

> Status antes de começar: 459 migrations no repositório; jornada do gerente
> 94/94 e fixture E2E 11/11 comprovadas em PostgreSQL embarcado. Nada disso
> substitui os passos abaixo na sua stack.

## 1. Subir a stack local

```powershell
cd C:\caminho\use-erp-wms-1
.\instalar-local.ps1
docker compose -f docker-compose.local.yml --env-file .env.local ps
```

**Evidência:** todos os serviços `up` (db, auth, rest, realtime, storage,
functions, imgproxy, meta, migrate, studio, web) e o serviço `migrate`
terminando sem erro (ele para na primeira migration que falhar).

## 2. Conferir as 459 migrations aplicadas

```powershell
docker compose -f docker-compose.local.yml --env-file .env.local exec db `
  psql -U supabase_admin -d postgres -tAc "SELECT count(*) FROM supabase_migrations.schema_migrations"
```

**Evidência:** contagem compatível com as 459 migrations do repositório
(versões duplicadas históricas são registradas com sufixo pelo `migrate.sh`;
em dúvida, confira que as seis de 2026-10-19 constam:
`20261019100000`, `20261019110000`, `20261019120000`, `20261019130000`,
`20261019140000`, `20261019150000`, `20261019160000`, `20261019170000`).

## 3. Cadastrar a BIL e abrir o sistema

```powershell
.\cadastrar-bil.ps1
```

Abra `http://localhost:8080`, entre com o administrador criado e confirme:
empresa **BIL Importação e Exportação LTDA** (CNPJ 30.965.938/0001-07),
perfil **Tecelagem e tinturaria**, módulos de produção liberados.

## 4. Aplicar a fixture de homologação E2E (empresa de teste isolada)

```powershell
docker compose -f docker-compose.local.yml --env-file .env.local exec -T db `
  psql -U supabase_admin -d postgres `
  -v e2e_email=e2e.tecelagem@example.com -v e2e_password='TroqueEstaSenha1' `
  < tests/e2e/fixtures/weaving-fixture.sql
```

**Evidência:** o script imprime company/product/component/lot e termina sem
erro. Ele é idempotente (pode rodar de novo) e cria uma empresa separada
("E2E Homologação Têxtil") — não toca na BIL.

## 5. Rodar a jornada E2E de tecelagem (efeitos persistidos)

Na raiz do repositório, com Node instalado:

```powershell
$env:VITE_SUPABASE_URL = "http://localhost:8080"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = (Select-String -Path .env.local -Pattern '^ANON_KEY=').Line.Split('=')[1]
$env:E2E_WEAVING_EMAIL = "e2e.tecelagem@example.com"
$env:E2E_WEAVING_PASSWORD = "TroqueEstaSenha1"
$env:E2E_WEAVING_PRODUCT_ID = "e2000000-0000-4000-8000-000000000010"
$env:E2E_WEAVING_COMPONENT_ID = "e2000000-0000-4000-8000-000000000011"
$env:E2E_WEAVING_LOT_ID = "e2000000-0000-4000-8000-000000000030"
npx playwright test tests/e2e/textile-weaving-pcp.spec.ts --config=e2e/playwright.config.ts --project=chromium
```

**Evidência:** 1 teste **aprovado** (não "skipped"). A spec cria OP com
snapshot, reserva o lote, agenda sem dupla alocação, aponta as etapas, aprova
a qualidade e conclui com genealogia — conferindo saldos no banco a cada
passo. Se ela pular (skipped), alguma variável acima faltou: não homologou.

## 6. Homologação manual na interface (gerente de produção)

Com o usuário da BIL, execute e confira na tela:

1. **Ordens de Produção**: criar OP de tecido a partir do artigo com
   BOM/roteiro; conferir snapshot congelado no detalhe da OP.
2. **Programação da Produção**: programar a OP numa máquina; tentar
   sobrepor outra OP na mesma máquina (deve recusar); cancelar e
   reprogramar (deve aceitar).
3. **Acompanhamento por Etapas / Terminal do Operador**: apontar produção
   parcial e total por etapa; a OP não pode sumir ao entrar em acabamento.
4. **Qualidade**: registrar inspeção e aprovar formalmente; tentar concluir
   sem aprovação (deve bloquear).
5. **Concluir a OP**: conferir lote de saída, consumo do lote reservado e
   genealogia (origem ↔ destino) no detalhe da OP/rastreabilidade.
6. **Fila de Produção e Kanban**: OP visível nos estados certos; nenhuma
   ação conclui OP por fora da transação.

## 7. Regenerar os tipos do Supabase (fecha a pendência de tipos)

Com a stack no ar:

```powershell
npx supabase gen types typescript --db-url "postgresql://supabase_admin:SENHA@localhost:5432/postgres" > src/integrations/supabase/types.ts
npm run typecheck:weaving
```

(Use a senha do `POSTGRES_PASSWORD` do `.env.local` e a porta publicada do
serviço `db`, se diferente de 5432.) **Evidência:** tipos regenerados
incluindo as tabelas/RPCs industriais e `typecheck:weaving` verde.

## 8. Regressão rápida antes de liberar para uso

```powershell
node --test scripts/test-weaving-pcp-execution.mjs
npm run build
```

**Evidência:** contrato de tecelagem aprovado e build concluído (na sua
máquina, com 6 GB de RAM no Docker Desktop — neste sandbox de 2 GB o build
não coube e isso está registrado na auditoria).

## Critério de homologação

Só considere homologado quando os passos 1–7 tiverem evidência arquivada
(saída dos comandos + prints das telas do passo 6). Problemas encontrados
devem voltar como defeito registrado — nunca como ajuste manual direto no
banco de produção.
