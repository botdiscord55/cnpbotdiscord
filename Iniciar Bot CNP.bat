@echo off
chcp 65001 >nul
title Bot CNP - Consola
cd /d "%~dp0"
node src\index.js
echo.
echo [Bot detenido. Pulsa cualquier tecla para cerrar esta ventana...]
pause >nul
