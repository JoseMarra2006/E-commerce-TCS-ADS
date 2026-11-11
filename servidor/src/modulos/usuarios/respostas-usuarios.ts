import type { UsuarioRegistro } from "./tipos-usuarios.ts";

export type RespostaUsuario = {
  id: number;
  nome: string;
  email: string;
  admin: boolean;
};

export function paraRespostaUsuario(usuario: UsuarioRegistro): RespostaUsuario {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    admin: usuario.papel === "administrador",
  };
}
