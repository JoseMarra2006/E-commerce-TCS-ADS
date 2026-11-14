import type { RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";
import type { SessaoAtiva } from "./contexto-sessao.ts";

export function criarSessaoAtiva(resposta: RespostaSessao): SessaoAtiva {
  return { token: resposta.token, idSessao: resposta.id, usuario: resposta.usuario };
}

export function substituirUsuarioDaSessao(
  atual: SessaoAtiva | null,
  usuario: RespostaUsuario,
): SessaoAtiva | null {
  return atual === null ? null : { ...atual, usuario };
}
