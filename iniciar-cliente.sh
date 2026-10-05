#!/usr/bin/env sh
cd "$(dirname "$0")/cliente" || exit 1
if ! command -v deno >/dev/null 2>&1; then
  echo "Deno nao encontrado. Instale o Deno 2.2 ou superior e tente novamente."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale o Node.js e tente novamente."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Instalando as dependencias do cliente. Isso so acontece na primeira vez."
  if ! npm ci; then
    echo "Nao foi possivel instalar as dependencias. Verifique a conexao com a internet."
    exit 1
  fi
fi
echo "Preparando a interface do cliente..."
if ! npm run build; then
  echo "Nao foi possivel preparar a interface do cliente."
  exit 1
fi
cd intermediario || exit 1
deno task start
