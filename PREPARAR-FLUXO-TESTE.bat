@echo off
chcp 65001 >nul
title USE ERP - Preparar fluxo de teste
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - FLUXO DE TESTE TEXTIL COMPLETO
echo ============================================================
echo.
echo  Preenche a BIL com dados funcionais navegaveis:
echo   pedido do cliente -^> pluma classificada em lotes -^> fiacao
echo   -^> malharia -^> tinturaria -^> malha tingida em estoque.
echo  Tudo pelas funcoes reais do sistema (nada de dado falso).
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-fluxo-teste.ps1"
if errorlevel 1 (
  echo.
  echo A preparacao parou com erro - veja a mensagem acima.
)
echo.
pause
exit /b 0
