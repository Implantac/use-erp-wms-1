@echo off
chcp 65001 >nul
title USE ERP - Diagnostico
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - DIAGNOSTICO DA INSTALACAO
echo ============================================================
echo.
echo  Coleta o estado dos containers, das migrations e dos logs
echo  e grava tudo em diagnostico.txt nesta pasta.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "diagnostico-local.ps1"

echo.
pause
exit /b 0
