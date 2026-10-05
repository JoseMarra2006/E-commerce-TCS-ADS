import { useContext } from "react";
import { ContextoConexao } from "./contexto-conexao.ts";
import type { ValorContextoConexao } from "./contexto-conexao.ts";

export function useConexao(): ValorContextoConexao {
  const valor = useContext(ContextoConexao);
  if (valor === null) {
    throw new Error("useConexao deve ser usado dentro de ProvedorConexao.");
  }
  return valor;
}
