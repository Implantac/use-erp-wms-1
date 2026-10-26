@echo off
chcp 65001 >nul
title USE ERP - Limpar Docker (liberar espaco de verdade)
cd /d "%~dp0"

rem Administrador e necessario para a etapa de compactar; eleva sozinho.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b 0
)

echo ============================================================
echo  LIMPEZA DO DOCKER
echo ============================================================
echo.
echo  Etapa 1: tira o lixo (containers parados, imagens orfas,
echo  cache antigo) SEM tocar no banco e nos volumes.
echo  Etapa 2: compacta o disco virtual para o C: enxergar o
echo  espaco de volta (o script pergunta antes).
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "limpar-docker.ps1"
echo.
pause
exit /b 0
