@echo off
chcp 65001 >nul
title USE ERP - Lojas Texas Farm (catalogo com fotos + Loja 2)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-lojas-texas.ps1"
echo.
pause
