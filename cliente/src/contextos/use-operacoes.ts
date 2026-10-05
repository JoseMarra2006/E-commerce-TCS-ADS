import { useContext } from "react";
import type { Operacoes } from "../api/operacoes.ts";
import { ContextoOperacoes } from "./contexto-operacoes.ts";

export function useOperacoes(): Operacoes {
  const valor = useContext(ContextoOperacoes);
  if (valor === null) {
    throw new Error("useOperacoes deve ser usado dentro de ProvedorOperacoes.");
  }
  return valor;
}
