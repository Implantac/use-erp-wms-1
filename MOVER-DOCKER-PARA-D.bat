@echo off
chcp 65001 >nul
title USE ERP - Mover dados do Docker para o D:
cd /d "%~dp0"

rem Precisa de administrador para parar o servico do Docker; eleva sozinho.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b 0
)

echo ============================================================
echo  MOVER OS DADOS DO DOCKER PARA O D:
echo ============================================================
echo.
echo  O Docker Desktop para por alguns minutos; os dados (banco,
echo  imagens, volumes) vao para D:\Docker e o C: e liberado.
echo  O script confere a copia antes de apagar qualquer coisa e
echo  desfaz automaticamente se o Docker nao voltar.
echo.
echo  IMPORTANTE: feche o sistema (FECHAR-SISTEMA.bat) e nao use
echo  o Docker durante a mudanca.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "mover-docker-para-d.ps1"
echo.
pause
exit /b 0
