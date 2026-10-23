@echo off
chcp 65001 >nul
title USE ERP - Verificacao Lojas Texas Farm
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verificar-lojas.ps1"
echo.
pause
