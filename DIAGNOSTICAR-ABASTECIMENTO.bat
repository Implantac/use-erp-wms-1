@echo off
chcp 65001 >nul
title USE ERP - Diagnostico do abastecimento (Loja x Fabrica)
cd /d "%~dp0"
echo ============================================================
echo  DIAGNOSTICO - por que a solicitacao da Loja nao aparece?
echo  (somente leitura: nao altera nada)
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "diagnosticar-abastecimento.ps1"
echo.
pause
exit /b 0
