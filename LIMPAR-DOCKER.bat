@echo off
chcp 65001 >nul
title USE ERP - Limpar Docker (liberar espaco com seguranca)
cd /d "%~dp0"
echo ============================================================
echo  LIMPEZA SEGURA DO DOCKER
echo ============================================================
echo.
echo  Remove so lixo: containers parados, imagens orfas e cache
echo  de build antigo. NAO apaga banco, volumes nem a imagem de
echo  rollback.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "limpar-docker.ps1"
echo.
pause
exit /b 0
