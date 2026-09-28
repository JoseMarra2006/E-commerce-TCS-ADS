import type { ConexaoBanco } from "../../banco/conexao.ts";
import type { SessaoRegistro } from "./tipos-sessoes.ts";

const COLUNAS_SESSAO = "id, usuario_id, criado_em";

function converterLinhaSessao(linha: Record<string, unknown>): SessaoRegistro {
  const { id, usuario_id, criado_em } = linha;

  if (
    typeof id !== "string" ||
    typeof usuario_id !== "number" ||
    !Number.isInteger(usuario_id) ||
    typeof criado_em !== "string"
  ) {
    throw new Error("Registro de sessão inválido no banco de dados.");
  }

  return {
    id,
    usuarioId: usuario_id,
    criadoEm: criado_em,
  };
}

export function criarSessao(
  conexao: ConexaoBanco,
  usuarioId: number,
): SessaoRegistro {
  const id = crypto.randomUUID();
  const criadoEm = new Date().toISOString();

  const linha = conexao
    .prepare(
      `INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?) RETURNING ${COLUNAS_SESSAO};`,
    )
    .get(id, usuarioId, criadoEm);

  if (linha === undefined) {
    throw new Error("Registro de sessão inválido no banco de dados.");
  }

  return converterLinhaSessao(linha);
}

export function buscarSessaoPorId(
  conexao: ConexaoBanco,
  id: string,
): SessaoRegistro | null {
  const linha = conexao
    .prepare(`SELECT ${COLUNAS_SESSAO} FROM sessoes WHERE id = ?;`)
    .get(id);

  return linha === undefined ? null : converterLinhaSessao(linha);
}

export function excluirSessao(conexao: ConexaoBanco, id: string): boolean {
  const resultado = conexao.prepare("DELETE FROM sessoes WHERE id = ?;").run(
    id,
  );
  return Number(resultado.changes) > 0;
}
