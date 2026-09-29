import { paraRespostaUsuario } from "../usuarios/respostas-usuarios.ts";
import type { RespostaUsuario } from "../usuarios/respostas-usuarios.ts";
import type { UsuarioRegistro } from "../usuarios/tipos-usuarios.ts";
import type { SessaoRegistro } from "./tipos-sessoes.ts";

export type RespostaSessao = {
  id: string;
  token: string;
  usuario: RespostaUsuario;
};

export function paraRespostaSessao(
  sessao: SessaoRegistro,
  token: string,
  usuario: UsuarioRegistro,
): RespostaSessao {
  return { id: sessao.id, token, usuario: paraRespostaUsuario(usuario) };
}
