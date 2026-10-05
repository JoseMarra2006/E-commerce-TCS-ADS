@echo off
chcp 65001 >nul
cd /d "%~dp0cliente"
where deno >nul 2>nul
if errorlevel 1 (
  echo Deno nao encontrado. Instale o Deno 2.2 ou superior e tente novamente.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando as dependencias do cliente. Isso so acontece na primeira vez.
  call npm ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias. Verifique a conexao com a internet.
    pause
    exit /b 1
  )
)
echo Preparando a interface do cliente...
call npm run build
if errorlevel 1 (
  echo Nao foi possivel preparar a interface do cliente.
  pause
  exit /b 1
)
cd intermediario
deno task start
if errorlevel 1 pause
