import type { ConexaoBanco } from "../../banco/conexao.ts";
import {
  atualizarProduto,
  buscarProdutoPorId,
  criarProduto,
  excluirProduto as excluirProdutoDoBanco,
  listarProdutos,
} from "./repositorio-produtos.ts";
import type {
  AlteracoesProduto,
  DadosNovoProduto,
  ProdutoRegistro,
} from "./tipos-produtos.ts";

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

export function substituirProduto(
  conexao: ConexaoBanco,
  id: number,
  dados: DadosNovoProduto,
): ProdutoRegistro | undefined {
  return atualizarProduto(conexao, id, dados);
}

export function atualizarDadosProduto(
  conexao: ConexaoBanco,
  id: number,
  alteracoes: AlteracoesProduto,
): ProdutoRegistro | undefined {
  return atualizarProduto(conexao, id, alteracoes);
}

export function excluirProduto(conexao: ConexaoBanco, id: number): boolean {
  return excluirProdutoDoBanco(conexao, id);
}
