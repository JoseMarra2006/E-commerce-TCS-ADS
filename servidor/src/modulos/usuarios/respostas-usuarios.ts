import type { UsuarioRegistro } from "./tipos-usuarios.ts";

export type RespostaUsuario = { id: number; nome: string; email: string };

export function paraRespostaUsuario(usuario: UsuarioRegistro): RespostaUsuario {
  return { id: usuario.id, nome: usuario.nome, email: usuario.email };
}
