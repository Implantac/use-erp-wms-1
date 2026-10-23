@echo off
chcp 65001 >nul
title USE ERP - Reparar banco
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - REPARAR O BANCO (sem apagar nada)
echo ============================================================
echo.
echo  Cria os papeis internos do Supabase que faltaram na
echo  inicializacao, reinicia os servicos e aplica as migrations.
echo  Nenhum dado e apagado.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "reparar-banco.ps1"
if errorlevel 1 (
  echo.
  echo O reparo parou com erro - veja a mensagem acima.
)
echo.
pause
exit /b 0
