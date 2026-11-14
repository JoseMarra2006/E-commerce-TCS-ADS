export const AVISO_USUARIO_ATUALIZADO = "Usuário atualizado com sucesso.";
export const AVISO_USUARIO_EXCLUIDO = "Usuário excluído com sucesso.";
export const AVISO_USUARIO_JA_EXCLUIDO = "Esse usuário já havia sido excluído.";

export type CodigoAvisoUsuario = "atualizado" | "excluido" | "ja_excluido";

const CODIGOS_AVISO: Record<CodigoAvisoUsuario, string> = {
  atualizado: AVISO_USUARIO_ATUALIZADO,
  excluido: AVISO_USUARIO_EXCLUIDO,
  ja_excluido: AVISO_USUARIO_JA_EXCLUIDO,
};

export interface EstadoAvisoUsuario {
  avisoUsuario: CodigoAvisoUsuario;
}

export function criarEstadoAvisoUsuario(codigo: CodigoAvisoUsuario): EstadoAvisoUsuario {
  return { avisoUsuario: codigo };
}

export function criarEstadoAvisoUsuarioAtualizado(): EstadoAvisoUsuario {
  return criarEstadoAvisoUsuario("atualizado");
}

function ehCodigoAviso(valor: string): valor is CodigoAvisoUsuario {
  return Object.hasOwn(CODIGOS_AVISO, valor);
}

export function lerAvisoUsuario(estado: unknown): string | null {
  if (typeof estado !== "object" || estado === null || Array.isArray(estado)) {
    return null;
  }
  if (!("avisoUsuario" in estado) || typeof estado.avisoUsuario !== "string") {
    return null;
  }
  return ehCodigoAviso(estado.avisoUsuario) ? CODIGOS_AVISO[estado.avisoUsuario] : null;
}
