import { useContext } from "react";
import { ContextoTema } from "./contexto-tema.ts";
import type { ValorContextoTema } from "./contexto-tema.ts";

export function useTema(): ValorContextoTema {
  const valor = useContext(ContextoTema);
  if (valor === null) {
    throw new Error("useTema deve ser usado dentro de ProvedorTema.");
  }
  return valor;
}
