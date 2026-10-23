@echo off
chcp 65001 >nul
title USE ERP - Cadastrar Grupo Zipo + Texas Farm Store
cd /d %~dp0
echo ============================================================
echo  USE ERP - GRUPO ZIPO CONFECÇÕES + TEXAS FARM STORE
echo ============================================================
echo.
echo  Cadastra a industria Zipo Confeccoes (nicho Confeccao) e a
echo  Loja Texas Farm Store do mesmo grupo, com o usuario etc
echo  suporte como superadmin das duas empresas, estoque inicial
echo  e politicas de reposicao para testar o fluxo de lojas.
echo  Nao apaga dados existentes; pode rodar de novo.
echo.
echo  Na senha, use a MESMA do seu login atual.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-grupo-zipo.ps1"
echo.
pause
