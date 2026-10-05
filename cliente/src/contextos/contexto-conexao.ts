import { createContext } from "react";
import type { ConexaoServidor } from "../api/cliente-http.ts";

export interface ValorContextoConexao {
  conexao: ConexaoServidor | null;
  definirConexao: (conexao: ConexaoServidor) => void;
  limparConexao: () => void;
  obterConexaoAtual: () => ConexaoServidor | null;
}

export const ContextoConexao = createContext<ValorContextoConexao | null>(null);
