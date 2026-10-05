import { createContext } from "react";
import type { Tema } from "./tema.ts";

export interface ValorContextoTema {
  tema: Tema;
  alternar: () => void;
}

export const ContextoTema = createContext<ValorContextoTema | null>(null);
