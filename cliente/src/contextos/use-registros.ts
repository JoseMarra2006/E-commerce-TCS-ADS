import { useContext } from "react";
import { ContextoRegistros } from "./contexto-registros.ts";
import type { ValorContextoRegistros } from "./contexto-registros.ts";

export function useRegistros(): ValorContextoRegistros {
  const valor = useContext(ContextoRegistros);
  if (valor === null) {
    throw new Error("useRegistros deve ser usado dentro de ProvedorRegistros.");
  }
  return valor;
}
