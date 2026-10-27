@echo off
chcp 65001 >nul
title USE ERP - Diagnostico de login e realtime
cd /d "%~dp0"
echo ============================================================
echo  DIAGNOSTICO - login recusado (400) e erro do Realtime
echo  (nao altera dados: so le status, usuarios e logs)
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "diagnosticar-login.ps1"
echo.
pause
exit /b 0
