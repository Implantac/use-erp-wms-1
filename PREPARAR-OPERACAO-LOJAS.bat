@echo off
chcp 65001 >nul
title USE ERP - Dia operacional das lojas
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-operacao-lojas.ps1"
echo.
pause
