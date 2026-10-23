@echo off
chcp 65001 >nul
title USE ERP - Iniciar
cd /d "%~dp0"

echo Ligando o USE ERP local...
docker info >nul 2>nul
if errorlevel 1 (
  echo O Docker nao esta rodando. Abrindo o Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  echo Aguarde o Docker ficar pronto e rode este arquivo de novo.
  pause
  exit /b 1
)

docker compose -f docker-compose.local.yml --env-file .env.local up -d
if errorlevel 1 (
  echo Falha ao ligar. Veja os logs: docker compose -f docker-compose.local.yml --env-file .env.local logs
  pause
  exit /b 1
)

echo Sistema ligando em http://localhost:8080 (aguarde alguns segundos)...
timeout /t 8 /nobreak >nul
start "" "http://localhost:8080"
exit /b 0
