@echo off
chcp 65001 >nul
title USE ERP - Preparar E2E das lojas (usuarios + .env.e2e)
cd /d "%~dp0"
echo ============================================================
echo  PREPARAR E2E - cria usuarios de homologacao e gera .env.e2e
echo  ( rode depois de PREPARAR-GRUPO-ZIPO e PREPARAR-LOJAS-TEXAS )
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-e2e-lojas.ps1"
echo.
pause
exit /b 0
