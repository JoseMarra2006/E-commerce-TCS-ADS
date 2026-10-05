import { createContext } from "react";
import type { RegistroMensagem } from "../api/cliente-http.ts";

export interface ValorContextoRegistros {
  registros: readonly RegistroMensagem[];
  adicionarRegistro: (registro: RegistroMensagem) => void;
  limparRegistros: () => void;
}

export const ContextoRegistros = createContext<ValorContextoRegistros | null>(null);
