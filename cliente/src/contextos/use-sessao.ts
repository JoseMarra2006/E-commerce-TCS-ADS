import { useContext } from "react";
import { ContextoSessao } from "./contexto-sessao.ts";
import type { ValorContextoSessao } from "./contexto-sessao.ts";

export function useSessao(): ValorContextoSessao {
  const valor = useContext(ContextoSessao);
  if (valor === null) {
    throw new Error("useSessao deve ser usado dentro de ProvedorSessao.");
  }
  return valor;
}
