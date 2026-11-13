import { DatabaseSync } from "node:sqlite";
import type { ConexaoBanco } from "../banco/conexao.ts";

export type TipoUsuarioLogado = "administrador" | "comum";

export interface UsuarioLogado {
  id: number;
  nome: string;
  email: string;
  tipo: TipoUsuarioLogado;
  sessoes: number;
  desde: string;
}

const CONSULTA_USUARIOS_LOGADOS = `
SELECT
  usuarios.id AS id,
  usuarios.nome AS nome,
  usuarios.email AS email,
  usuarios.papel AS papel,
  COUNT(sessoes.id) AS sessoes,
  MIN(sessoes.criado_em) AS desde
FROM usuarios
INNER JOIN sessoes ON sessoes.usuario_id = usuarios.id
GROUP BY usuarios.id
ORDER BY usuarios.id ASC;
`;

export function abrirConexaoSomenteLeitura(caminhoBanco: string): ConexaoBanco {
  const conexao = new DatabaseSync(caminhoBanco, { readOnly: true });
  try {
    conexao.exec("PRAGMA busy_timeout = 5000;");
    conexao.exec("PRAGMA query_only = ON;");
    return conexao;
  } catch (erro) {
    conexao.close();
    throw erro;
  }
}

function converterLinha(linha: Record<string, unknown>): UsuarioLogado {
  const { id, nome, email, papel, sessoes, desde } = linha;

  if (
    typeof id !== "number" ||
    typeof nome !== "string" ||
    typeof email !== "string" ||
    typeof papel !== "string" ||
    typeof sessoes !== "number" ||
    typeof desde !== "string"
  ) {
    throw new Error("Registro de usuário logado inválido no banco de dados.");
  }

  return {
    id,
    nome,
    email,
    tipo: papel === "administrador" ? "administrador" : "comum",
    sessoes,
    desde,
  };
}

export function consultarUsuariosLogados(
  conexao: ConexaoBanco,
): UsuarioLogado[] {
  return conexao
    .prepare(CONSULTA_USUARIOS_LOGADOS)
    .all()
    .map((linha) => converterLinha(linha));
}
