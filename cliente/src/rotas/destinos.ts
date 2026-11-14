export type RequisitoAcesso = "sessao" | "sem_sessao" | "admin";

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
  sessaoDeAdministrador = false,
): DecisaoAcesso {
  if (!temConexao) {
    return { permitido: false, destino: "/conexao" };
  }
  if ((requisito === "sessao" || requisito === "admin") && !temSessao) {
    return { permitido: false, destino: "/login" };
  }
  if (requisito === "admin" && !sessaoDeAdministrador) {
    return { permitido: false, destino: "/perfil" };
  }
  if (requisito === "sem_sessao" && temSessao) {
    return { permitido: false, destino: "/perfil" };
  }
  return { permitido: true };
}
