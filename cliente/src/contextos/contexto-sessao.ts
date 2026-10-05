import { createContext } from "react";
import type { RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";

export interface SessaoAtiva {
  token: string;
  idSessao: string;
  usuario: RespostaUsuario;
}

export interface AvisoSessao {
  tipo: "sucesso" | "info" | "aviso";
  texto: string;
}

export interface ValorContextoSessao {
  sessao: SessaoAtiva | null;
  avisoSessao: AvisoSessao | null;
  iniciarSessao: (resposta: RespostaSessao) => void;
  atualizarUsuario: (usuario: RespostaUsuario) => void;
  encerrarSessaoLocal: (aviso?: AvisoSessao) => void;
  consumirAvisoSessao: () => AvisoSessao | null;
}

export const ContextoSessao = createContext<ValorContextoSessao | null>(null);
