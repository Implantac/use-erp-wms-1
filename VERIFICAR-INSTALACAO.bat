@echo off
chcp 65001 >nul
title USE ERP - Verificar instalacao
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "verificar-instalacao.ps1"
echo.
pause
exit /b 0
