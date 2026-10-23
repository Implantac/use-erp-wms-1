@echo off
chcp 65001 >nul
title USE ERP - Preparar teste de tecelagem
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - TESTE DE TECELAGEM PLANA (TEAR)
echo ============================================================
echo.
echo  Preenche a BIL com um teste navegavel de tecelagem:
echo   fio de urdume + fio de trama -^> perfil do tear -^> OP
echo   executada -^> tecido plano cru em estoque (480 m).
echo  Tudo pelas funcoes reais do sistema (nada de dado falso).
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-tecelagem-teste.ps1"
if errorlevel 1 (
  echo.
  echo A preparacao parou com erro - veja a mensagem acima.
)
echo.
pause
exit /b 0
