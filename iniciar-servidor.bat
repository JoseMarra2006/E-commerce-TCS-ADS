@echo off
chcp 65001 >nul
cd /d "%~dp0servidor"
where deno >nul 2>nul
if errorlevel 1 (
  echo Deno nao encontrado. Instale o Deno 2.2 ou superior e tente novamente.
  pause
  exit /b 1
)
deno task start
if errorlevel 1 pause
