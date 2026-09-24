#!/usr/bin/env sh
cd "$(dirname "$0")/servidor" || exit 1
if ! command -v deno >/dev/null 2>&1; then
  echo "Deno nao encontrado. Instale o Deno 2.2 ou superior e tente novamente."
  exit 1
fi
deno task start
