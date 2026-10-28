@echo off
chcp 65001 >nul
title USE ERP - Reinstalar do zero
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - REINSTALAR DO ZERO (banco vazio quebrado)
echo ============================================================
echo.
echo  Use SOMENTE quando a primeira inicializacao do banco foi
echo  interrompida (nenhuma migration aplicada, servicos em loop).
echo.
echo  O script CONFERE o banco antes: se houver qualquer dado
echo  (migration aplicada, empresa ou usuario), ele ABORTA sem
echo  apagar nada. Os segredos do .env.local sao mantidos.
echo.
set "CONF="
set /p "CONF=Digite APAGAR para descartar os volumes e reinstalar: "
if /i not "%CONF%"=="APAGAR" (
  echo Cancelado - nada foi alterado.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "limpar-banco-vazio.ps1"
if errorlevel 1 (
  echo.
  echo A limpeza foi abortada - veja a mensagem acima. Nada foi apagado.
  pause
  exit /b 1
)

echo.
echo ==> Volumes descartados. Iniciando a instalacao completa...
call INSTALAR-TUDO.bat
exit /b 0
