import type { ProdutoRegistro } from "./tipos-produtos.ts";

export type RespostaProduto = {
  id: number;
  nome: string;
  descricao: string;
  quantidade: number;
};

export function paraRespostaProduto(produto: ProdutoRegistro): RespostaProduto {
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    quantidade: produto.quantidade,
  };
}
