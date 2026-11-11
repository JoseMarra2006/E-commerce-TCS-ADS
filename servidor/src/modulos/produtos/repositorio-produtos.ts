import type { ConexaoBanco } from "../../banco/conexao.ts";
import type {
  AlteracoesProduto,
  DadosNovoProduto,
  ProdutoRegistro,
} from "./tipos-produtos.ts";

const COLUNAS_PRODUTO =
  "id, nome, descricao, quantidade, criado_em, atualizado_em";

function converterLinhaProduto(
  linha: Record<string, unknown>,
): ProdutoRegistro {
  const { id, nome, descricao, quantidade, criado_em, atualizado_em } = linha;

  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof nome !== "string" ||
    typeof descricao !== "string" ||
    typeof quantidade !== "number" ||
    !Number.isInteger(quantidade) ||
    typeof criado_em !== "string" ||
    typeof atualizado_em !== "string"
  ) {
    throw new Error("Registro de produto inválido no banco de dados.");
  }

  return {
    id,
    nome,
    descricao,
    quantidade,
    criadoEm: criado_em,
    atualizadoEm: atualizado_em,
  };
}

export function criarProduto(
  conexao: ConexaoBanco,
  dados: DadosNovoProduto,
): ProdutoRegistro {
  const agora = new Date().toISOString();
  const linha = conexao
    .prepare(
      `INSERT INTO produtos (nome, descricao, quantidade, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?) RETURNING ${COLUNAS_PRODUTO};`,
    )
    .get(dados.nome, dados.descricao, dados.quantidade, agora, agora);

  if (linha === undefined) {
    throw new Error("Registro de produto inválido no banco de dados.");
  }

  return converterLinhaProduto(linha);
}

export function buscarProdutoPorId(
  conexao: ConexaoBanco,
  id: number,
): ProdutoRegistro | undefined {
  const linha = conexao
    .prepare(`SELECT ${COLUNAS_PRODUTO} FROM produtos WHERE id = ?;`)
    .get(id);

  return linha === undefined ? undefined : converterLinhaProduto(linha);
}

export function listarProdutos(conexao: ConexaoBanco): ProdutoRegistro[] {
  return conexao
    .prepare(`SELECT ${COLUNAS_PRODUTO} FROM produtos ORDER BY id ASC;`)
    .all()
    .map((linha) => converterLinhaProduto(linha));
}

export function atualizarProduto(
  conexao: ConexaoBanco,
  id: number,
  alteracoes: AlteracoesProduto,
): ProdutoRegistro | undefined {
  const colunas: string[] = [];
  const valores: (string | number)[] = [];

  if (alteracoes.nome !== undefined) {
    colunas.push("nome");
    valores.push(alteracoes.nome);
  }

  if (alteracoes.descricao !== undefined) {
    colunas.push("descricao");
    valores.push(alteracoes.descricao);
  }

  if (alteracoes.quantidade !== undefined) {
    colunas.push("quantidade");
    valores.push(alteracoes.quantidade);
  }

  colunas.push("atualizado_em");
  valores.push(new Date().toISOString());

  const atribuicoes = colunas.map((coluna) => `${coluna} = ?`).join(", ");
  valores.push(id);

  const linha = conexao
    .prepare(
      `UPDATE produtos SET ${atribuicoes} WHERE id = ? RETURNING ${COLUNAS_PRODUTO};`,
    )
    .get(...valores);

  return linha === undefined ? undefined : converterLinhaProduto(linha);
}

export function excluirProduto(conexao: ConexaoBanco, id: number): boolean {
  const resultado = conexao.prepare("DELETE FROM produtos WHERE id = ?;").run(
    id,
  );
  return Number(resultado.changes) > 0;
}
