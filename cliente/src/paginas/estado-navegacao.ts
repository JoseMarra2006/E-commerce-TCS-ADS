export interface EstadoLogin {
  email?: string;
  mensagem?: string;
}

export interface EstadoPerfil {
  mensagem?: string;
}

export function lerEstadoLogin(estado: unknown): EstadoLogin {
  if (typeof estado !== "object" || estado === null || Array.isArray(estado)) {
    return {};
  }
  const resultado: EstadoLogin = {};
  if ("email" in estado && typeof estado.email === "string") {
    resultado.email = estado.email;
  }
  if ("mensagem" in estado && typeof estado.mensagem === "string") {
    resultado.mensagem = estado.mensagem;
  }
  return resultado;
}

export function lerEstadoPerfil(estado: unknown): EstadoPerfil {
  if (typeof estado !== "object" || estado === null || Array.isArray(estado)) {
    return {};
  }
  if ("mensagem" in estado && typeof estado.mensagem === "string") {
    return { mensagem: estado.mensagem };
  }
  return {};
}
