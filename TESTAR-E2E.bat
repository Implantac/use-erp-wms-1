@echo off
chcp 65001 >nul
title USE ERP - Teste E2E da jornada das lojas
cd /d "%~dp0"
echo ============================================================
echo  TESTE E2E - JORNADA DAS Lojas (API real, com login)
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "testar-e2e.ps1"
echo.
pause
exit /b 0
