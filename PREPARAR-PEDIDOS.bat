@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\preparar-pedidos-clientes.ps1"
pause
