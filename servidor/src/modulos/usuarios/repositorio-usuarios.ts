import type { ConexaoBanco } from "../../banco/conexao.ts";
import type {
  AlteracoesUsuario,
  DadosNovoUsuario,
  UsuarioRegistro,
} from "./tipos-usuarios.ts";

const COLUNAS_USUARIO =
  "id, nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em";

function converterLinhaUsuario(
  linha: Record<string, unknown>,
): UsuarioRegistro {
  const {
    id,
    nome,
    email,
    senha_hash,
    senha_salt,
    papel,
    criado_em,
    atualizado_em,
  } = linha;

  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof nome !== "string" ||
    typeof email !== "string" ||
    typeof senha_hash !== "string" ||
    typeof senha_salt !== "string" ||
    (papel !== "comum" && papel !== "administrador") ||
    typeof criado_em !== "string" ||
    typeof atualizado_em !== "string"
  ) {
    throw new Error("Registro de usuário inválido no banco de dados.");
  }

  return {
    id,
    nome,
    email,
    senhaHash: senha_hash,
    senhaSalt: senha_salt,
    papel,
    criadoEm: criado_em,
    atualizadoEm: atualizado_em,
  };
}

export function criarUsuario(
  conexao: ConexaoBanco,
  dados: DadosNovoUsuario,
): UsuarioRegistro {
  const agora = new Date().toISOString();
  const linha = conexao
    .prepare(
      `INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUNAS_USUARIO};`,
    )
    .get(
      dados.nome,
      dados.email,
      dados.senhaHash,
      dados.senhaSalt,
      agora,
      agora,
    );

  if (linha === undefined) {
    throw new Error("Registro de usuário inválido no banco de dados.");
  }

  return converterLinhaUsuario(linha);
}

export function buscarUsuarioPorId(
  conexao: ConexaoBanco,
  id: number,
): UsuarioRegistro | null {
  const linha = conexao
    .prepare(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?;`)
    .get(id);

  return linha === undefined ? null : converterLinhaUsuario(linha);
}

export function buscarUsuarioPorEmail(
  conexao: ConexaoBanco,
  email: string,
): UsuarioRegistro | null {
  const linha = conexao
    .prepare(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE email = ?;`)
    .get(email);

  return linha === undefined ? null : converterLinhaUsuario(linha);
}

export function emailPertenceAOutroUsuario(
  conexao: ConexaoBanco,
  email: string,
  idUsuario: number,
): boolean {
  const linha = conexao
    .prepare(
      "SELECT 1 AS encontrado FROM usuarios WHERE email = ? AND id != ?;",
    )
    .get(email, idUsuario);

  return linha !== undefined;
}

export function atualizarUsuario(
  conexao: ConexaoBanco,
  id: number,
  alteracoes: AlteracoesUsuario,
): UsuarioRegistro | null {
  const colunas: string[] = [];
  const valores: (string | number)[] = [];

  if (alteracoes.nome !== undefined) {
    colunas.push("nome");
    valores.push(alteracoes.nome);
  }

  if (alteracoes.email !== undefined) {
    colunas.push("email");
    valores.push(alteracoes.email);
  }

  if (alteracoes.senha !== undefined) {
    colunas.push("senha_hash");
    valores.push(alteracoes.senha.hash);
    colunas.push("senha_salt");
    valores.push(alteracoes.senha.salt);
  }

  if (colunas.length === 0) {
    throw new Error("Nenhum campo informado para atualização.");
  }

  colunas.push("atualizado_em");
  valores.push(new Date().toISOString());

  const atribuicoes = colunas.map((coluna) => `${coluna} = ?`).join(", ");
  valores.push(id);

  const linha = conexao
    .prepare(
      `UPDATE usuarios SET ${atribuicoes} WHERE id = ? RETURNING ${COLUNAS_USUARIO};`,
    )
    .get(...valores);

  return linha === undefined ? null : converterLinhaUsuario(linha);
}

export function excluirUsuario(conexao: ConexaoBanco, id: number): boolean {
  const resultado = conexao.prepare("DELETE FROM usuarios WHERE id = ?;").run(
    id,
  );
  return Number(resultado.changes) > 0;
}
