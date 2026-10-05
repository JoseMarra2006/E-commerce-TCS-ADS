export type RequisitoAcesso = "sessao" | "sem_sessao";

export type DecisaoAcesso = { permitido: true } | { permitido: false; destino: string };

export function decidirDestinoInicial(
  temConexao: boolean,
  temSessao: boolean,
): "/conexao" | "/login" | "/perfil" {
  if (!temConexao) {
    return "/conexao";
  }
  return temSessao ? "/perfil" : "/login";
}

export function decidirAcesso(
  requisito: RequisitoAcesso,
  temConexao: boolean,
  temSessao: boolean,
): DecisaoAcesso {
  if (!temConexao) {
    return { permitido: false, destino: "/conexao" };
  }
  if (requisito === "sessao" && !temSessao) {
    return { permitido: false, destino: "/login" };
  }
  if (requisito === "sem_sessao" && temSessao) {
    return { permitido: false, destino: "/perfil" };
  }
  return { permitido: true };
}
