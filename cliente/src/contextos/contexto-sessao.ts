import { createContext } from "react";
import type { RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";

export interface SessaoAtiva {
  token: string;
  idSessao: string;
  usuario: RespostaUsuario;
}

export interface ValorContextoSessao {
  sessao: SessaoAtiva | null;
  avisoSessao: string | null;
  iniciarSessao: (resposta: RespostaSessao) => void;
  atualizarUsuario: (usuario: RespostaUsuario) => void;
  encerrarSessaoLocal: (aviso?: string) => void;
  consumirAvisoSessao: () => string | null;
}

export const ContextoSessao = createContext<ValorContextoSessao | null>(null);
