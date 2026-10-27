@echo off
chcp 65001 >nul
title USE ERP - Atualizacao segura (com verificacao e rollback)
cd /d "%~dp0"
echo ============================================================
echo  USE ERP - ATUALIZACAO SEGURA
echo ============================================================
echo.
echo  Faz backup do banco, atualiza banco e telas, VERIFICA se
echo  esta respondendo e, se algo falhar, VOLTA a versao anterior
echo  da tela automaticamente. Nao apaga dados.
echo.
echo  Iniciando em 3 segundos... (feche a janela para cancelar)
timeout /t 3 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "atualizar-seguro.ps1"
if errorlevel 1 (
  echo.
  echo A atualizacao parou - veja a mensagem acima.
)
echo.
pause
exit /b 0
