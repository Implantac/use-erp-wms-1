# Instalação em máquina limpa — roteiro de teste

Objetivo: provar que o sistema nasce do zero numa máquina que nunca o
viu. Tempo esperado: 20–40 min (a maior parte é download/build).

## Pré-requisitos da máquina
- Windows 10/11 64-bits com virtualização ligada (BIOS) e WSL2;
- Docker Desktop instalado e aberto (ícone "running");
- 8 GB de RAM livres e 10 GB de disco;
- Portas 8080 e 5432 livres.

## Passo a passo
1. Extraia o zip `use-erp-wms1-local.zip` numa pasta curta
   (ex.: `C:\use-erp`);
2. Rode **INSTALAR-TUDO.bat** e aguarde (cria senhas, sobe os serviços,
   aplica as 479 migrations e testa o healthz);
3. Rode **VERIFICAR-INSTALACAO.bat** — tudo tem que dar PASSOU
   (containers, healthz, página, migrations ≥ 479, empresas/usuários);
4. Abra `http://localhost:8080`, entre com o usuário admin criado na
   instalação e confira: Dashboard WMS abre, "Pronto para operar?"
   aparece e o menu **não** mostra IA/Gêmeo Digital/IoT (poda);
5. Rode os preparos do seu cenário (ex.: PREPARAR-GRUPO-ZIPO,
   PREPARAR-LOJAS-TEXAS) e o **VERIFICAR-LOJAS.bat**;
6. Opcional: **TESTAR-E2E.bat** (com o `.env.e2e` preenchido).

## Se algo falhar
- Docker não sobe → Docker Desktop/WSL2 (reinicie a máquina e tente);
- Healthz falha → aguarde 2 min e rode o DIAGNOSTICO-SISTEMA.bat;
- Migrations a menos → REPARAR-BANCO.bat;
- Anote o item exato do VERIFICAR-INSTALACAO que falhou e a saída da
  tela — é o que eu preciso para corrigir.

## Critério de aprovado
VERIFICAR-INSTALACAO 100% PASSOU + login funcionando + menu podado.
Só então a máquina entra em operação (e o backup externo da pasta
`backups\` entra na rotina).
