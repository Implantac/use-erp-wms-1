@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title USE ERP - Instalacao Local Completa
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - INSTALACAO LOCAL COMPLETA (Docker)
echo ============================================================
echo.
echo  Este instalador vai:
echo    1. Conferir (e tentar abrir) o Docker Desktop
echo    2. Gerar os segredos locais (.env.local) na primeira vez
echo    3. Baixar as imagens e construir o sistema (459 migrations)
echo    4. Subir banco, autenticacao, API e o site em localhost:8080
echo    5. Perguntar se cadastra a BIL Importacao e Exportacao LTDA
echo    6. Abrir o sistema no navegador
echo.
echo  Pre-requisitos: Docker Desktop instalado (com WSL2) e, de
echo  preferencia, 6 GB de RAM liberados para ele em
echo  Settings ^> Resources (o build da primeira vez usa ate 4 GB).
echo  A primeira instalacao pode demorar varios minutos.
echo.
pause

REM ---------------------------------------------------------------
REM 0. Estamos na pasta certa?
REM ---------------------------------------------------------------
if not exist "docker-compose.local.yml" (
  echo.
  echo [ERRO] Nao encontrei docker-compose.local.yml nesta pasta.
  echo Deixe o INSTALAR-TUDO.bat na PASTA RAIZ do projeto
  echo ^(a mesma onde esta o arquivo docker-compose.local.yml^)
  echo e rode de novo.
  echo.
  pause
  exit /b 1
)
if not exist "instalar-local.ps1" (
  echo.
  echo [ERRO] Nao encontrei instalar-local.ps1 nesta pasta.
  echo Extraia o projeto completo antes de instalar.
  echo.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------
REM 1. Docker instalado e rodando?
REM ---------------------------------------------------------------
echo.
echo ==^> Conferindo o Docker...
where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Docker nao encontrado neste computador.
  echo Instale o Docker Desktop ^(https://www.docker.com/products/docker-desktop^),
  echo abra ele uma vez, reinicie este instalador e tente de novo.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if not errorlevel 1 goto :docker_ok

echo Docker instalado, mas ainda nao esta rodando.
echo Tentando abrir o Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
  echo Nao achei o Docker Desktop no caminho padrao.
  echo Abra o Docker Desktop manualmente e rode este instalador de novo.
  echo.
  pause
  exit /b 1
)

echo Aguardando o Docker ficar pronto (pode levar 1-3 minutos)...
set /a tentativas=0
:espera_docker
timeout /t 10 /nobreak >nul
docker info >nul 2>nul
if not errorlevel 1 goto :docker_ok
set /a tentativas+=1
if !tentativas! GEQ 30 (
  echo.
  echo [ERRO] O Docker nao ficou pronto em 5 minutos.
  echo Abra o Docker Desktop, espere o icone ficar verde/estavel
  echo e rode este instalador de novo.
  echo.
  pause
  exit /b 1
)
goto :espera_docker

:docker_ok
echo   OK  Docker rodando.

REM ---------------------------------------------------------------
REM 2. Instalacao vai ser so neste PC ou na rede local?
REM ---------------------------------------------------------------
echo.
echo Como o sistema sera acessado?
echo   [1] Somente neste computador (localhost) - recomendado
echo   [2] Tambem por outros computadores da rede local
set "ESCOLHA=1"
set /p "ESCOLHA=Escolha [1]: "
if "%ESCOLHA%"=="2" (
  set "ARGS_PS="
) else (
  set "ARGS_PS=-SomenteLocal"
)

REM ---------------------------------------------------------------
REM 3. Instala (segredos + imagens + migrations + teste)
REM ---------------------------------------------------------------
echo.
echo ==^> Instalando o sistema (etapa longa na primeira vez)...
powershell -NoProfile -ExecutionPolicy Bypass -File "instalar-local.ps1" %ARGS_PS%
if errorlevel 1 (
  echo.
  echo [ERRO] A instalacao parou em alguma etapa (veja a mensagem
  echo acima). Nada foi perdido: rode este instalador de novo que
  echo ele continua de onde parou.
  echo.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------
REM 4. Cadastrar a BIL (empresa + administrador + producao)
REM ---------------------------------------------------------------
echo.
echo Deseja cadastrar agora a BIL Importacao e Exportacao LTDA
echo (empresa, administrador e todos os modulos de producao)?
set "CADASTRA=S"
set /p "CADASTRA=Cadastrar a BIL? [S/n]: "
if /i "%CADASTRA%"=="n" goto :fim
if /i "%CADASTRA%"=="nao" goto :fim

echo.
echo ==^> Cadastrando a BIL (sera pedida a senha do administrador)...
powershell -NoProfile -ExecutionPolicy Bypass -File "cadastrar-bil.ps1"
if errorlevel 1 (
  echo.
  echo [ERRO] O cadastro da BIL falhou (veja a mensagem acima).
  echo O sistema esta no ar; rode cadastrar-bil.ps1 de novo quando
  echo quiser. Nenhuma alteracao parcial foi gravada.
  echo.
  pause
  exit /b 1
)

:fim
REM ---------------------------------------------------------------
REM 5. Resumo + abrir o navegador
REM ---------------------------------------------------------------
echo.
echo ============================================================
echo  INSTALACAO CONCLUIDA!
echo ============================================================
echo.
echo  Sistema neste computador : http://localhost:8080
if "%ESCOLHA%"=="2" echo  Na rede local            : veja o endereco mostrado acima
echo.
echo  Login da BIL (se cadastrou): etcsuporte889@gmail.com
echo  com a senha que voce acabou de definir.
echo  Troque a senha depois do primeiro acesso.
echo.
echo  Outros comandos nesta pasta:
echo    INICIAR-SISTEMA.bat  - liga o sistema (depois de reiniciar o PC)
echo    PARAR-SISTEMA.bat    - desliga mantendo todos os dados
echo    backup-local.ps1     - backup do banco (PowerShell)
echo.
echo  Documentacao: docs\INSTALL-LOCAL.md e docs\HOMOLOGACAO-LOCAL.md
echo ============================================================
echo.
set "ABRIR=S"
set /p "ABRIR=Abrir o sistema no navegador agora? [S/n]: "
if /i not "%ABRIR%"=="n" start "" "http://localhost:8080"

echo.
pause
exit /b 0
