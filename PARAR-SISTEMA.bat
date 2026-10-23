@echo off
chcp 65001 >nul
title USE ERP - Parar
cd /d "%~dp0"

echo Desligando o USE ERP local (os dados NAO sao apagados)...
docker compose -f docker-compose.local.yml --env-file .env.local down
if errorlevel 1 (
  echo Falha ao desligar. O Docker esta rodando?
  pause
  exit /b 1
)
echo Sistema desligado. Para ligar de novo: INICIAR-SISTEMA.bat
pause
exit /b 0
