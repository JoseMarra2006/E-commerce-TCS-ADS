import type { ConexaoBanco } from "../../banco/conexao.ts";
import {
  buscarProdutoPorId,
  criarProduto,
  listarProdutos,
} from "./repositorio-produtos.ts";
import type { DadosNovoProduto, ProdutoRegistro } from "./tipos-produtos.ts";

export function listarTodosProdutos(conexao: ConexaoBanco): ProdutoRegistro[] {
  return listarProdutos(conexao);
}

export function obterProduto(
  conexao: ConexaoBanco,
  id: number,
): ProdutoRegistro | undefined {
  return buscarProdutoPorId(conexao, id);
}

export function cadastrarProduto(
  conexao: ConexaoBanco,
  dados: DadosNovoProduto,
): ProdutoRegistro {
  return criarProduto(conexao, dados);
}
