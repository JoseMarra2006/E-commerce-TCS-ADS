import { ehAdministrador } from "../contextos/eh-administrador.ts";
import type { RespostaProduto } from "../tipos/protocolo.ts";
import { caminhoDetalheProduto } from "./caminhos-produtos.ts";
import { formatarQuantidade, resumirDescricao } from "./formatacao-produto.ts";

export interface LinhaProduto {
  id: number;
  nome: string;
  resumoDescricao: string;
  semDescricao: boolean;
  quantidade: string;
  esgotado: boolean;
  caminhoDetalhe: string;
}

export type EstadoListaProdutos =
  | { fase: "carregando" }
  | { fase: "sucesso"; produtos: RespostaProduto[] }
  | { fase: "recarregando"; produtos: RespostaProduto[] }
  | { fase: "erro"; mensagem: string };

export type AcaoListaProdutos =
  | { tipo: "recarregar" }
  | { tipo: "recebido"; produtos: RespostaProduto[] }
  | { tipo: "falhou"; mensagem: string };

export const ESTADO_INICIAL_LISTA_PRODUTOS: EstadoListaProdutos = { fase: "carregando" };

export function montarLinhasProdutos(produtos: readonly RespostaProduto[]): LinhaProduto[] {
  return produtos.map((produto) => ({
    id: produto.id,
    nome: produto.nome,
    resumoDescricao: resumirDescricao(produto.descricao),
    semDescricao: produto.descricao.trim() === "",
    quantidade: formatarQuantidade(produto.quantidade),
    esgotado: produto.quantidade === 0,
    caminhoDetalhe: caminhoDetalheProduto(produto.id),
  }));
}

export function podeCadastrarProduto(usuario: object | null | undefined): boolean {
  return ehAdministrador(usuario);
}

export function textoContadorProdutos(quantidade: number): string {
  if (quantidade === 0) {
    return "Nenhum produto cadastrado";
  }
  return quantidade === 1 ? "1 produto cadastrado" : `${quantidade} produtos cadastrados`;
}

export function reduzirListaProdutos(
  estado: EstadoListaProdutos,
  acao: AcaoListaProdutos,
): EstadoListaProdutos {
  switch (acao.tipo) {
    case "recarregar":
      if (estado.fase === "sucesso" || estado.fase === "recarregando") {
        return { fase: "recarregando", produtos: estado.produtos };
      }
      return { fase: "carregando" };
    case "recebido":
      return { fase: "sucesso", produtos: acao.produtos };
    case "falhou":
      return { fase: "erro", mensagem: acao.mensagem };
  }
}
