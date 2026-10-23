@echo off
chcp 65001 >nul
title USE ERP - Corrigir login da BIL
cd /d "%~dp0"

echo ============================================================
echo  USE ERP - CORRIGIR LOGIN DO ADMINISTRADOR (BIL)
echo ============================================================
echo.
echo  Este corretor confere o usuario no banco, redefine a senha
echo  pelo cadastro oficial e TESTA o login de verdade no final.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "corrigir-login-bil.ps1"
if errorlevel 1 (
  echo.
  echo O corretor parou com erro - veja a mensagem acima.
)
echo.
pause
exit /b 0
