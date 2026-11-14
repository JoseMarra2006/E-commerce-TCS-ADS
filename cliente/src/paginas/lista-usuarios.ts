import { ehAdministrador } from "../contextos/eh-administrador.ts";
import type { RespostaUsuario } from "../tipos/protocolo.ts";
import { caminhoDetalheUsuario } from "./caminhos-usuarios.ts";

export interface LinhaUsuario {
  id: number;
  nome: string;
  email: string;
  tipo: "Administrador" | "Comum";
  administrador: boolean;
  ehVoce: boolean;
  caminhoDetalhe: string | null;
}

export type EstadoListaUsuarios =
  | { fase: "carregando" }
  | { fase: "sucesso"; usuarios: RespostaUsuario[] }
  | { fase: "recarregando"; usuarios: RespostaUsuario[] }
  | { fase: "erro"; mensagem: string };

export type AcaoListaUsuarios =
  | { tipo: "recarregar" }
  | { tipo: "recebido"; usuarios: RespostaUsuario[] }
  | { tipo: "falhou"; mensagem: string };

export const ESTADO_INICIAL_LISTA_USUARIOS: EstadoListaUsuarios = { fase: "carregando" };

export function rotularTipoUsuario(admin: boolean): "Administrador" | "Comum" {
  return admin ? "Administrador" : "Comum";
}

export function montarLinhasUsuarios(
  usuarios: readonly RespostaUsuario[],
  idUsuarioSessao: number | null,
): LinhaUsuario[] {
  return usuarios.map((usuario) => {
    const administrador = ehAdministrador(usuario);
    const ehVoce = idUsuarioSessao !== null && usuario.id === idUsuarioSessao;
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      tipo: rotularTipoUsuario(administrador),
      administrador,
      ehVoce,
      caminhoDetalhe: ehVoce ? null : caminhoDetalheUsuario(usuario.id),
    };
  });
}

export function textoContadorUsuarios(quantidade: number): string {
  return quantidade === 1 ? "1 usuário cadastrado" : `${quantidade} usuários cadastrados`;
}

export function reduzirListaUsuarios(
  estado: EstadoListaUsuarios,
  acao: AcaoListaUsuarios,
): EstadoListaUsuarios {
  switch (acao.tipo) {
    case "recarregar":
      if (estado.fase === "sucesso" || estado.fase === "recarregando") {
        return { fase: "recarregando", usuarios: estado.usuarios };
      }
      return { fase: "carregando" };
    case "recebido":
      return { fase: "sucesso", usuarios: acao.usuarios };
    case "falhou":
      return { fase: "erro", mensagem: acao.mensagem };
  }
}
