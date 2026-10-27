@echo off
chcp 65001 >nul
title USE ERP - Atualizar o frontend (web)
cd /d "%~dp0"
echo ============================================================
echo  USE ERP - ATUALIZAR O FRONTEND (WEB)
echo ============================================================
echo.
echo  Reconstroi a tela do sistema (build no Docker, alguns
echo  minutos) e recria o container web. Nao apaga dados.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "atualizar-web.ps1"
if errorlevel 1 (
  echo.
  echo A atualizacao parou com erro - veja a mensagem acima.
)
echo.
pause
exit /b 0
