import { createContext } from "react";
import type { Operacoes } from "../api/operacoes.ts";

export const ContextoOperacoes = createContext<Operacoes | null>(null);
