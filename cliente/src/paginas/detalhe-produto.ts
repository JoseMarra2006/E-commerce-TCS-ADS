import type { ResultadoOperacao } from "../api/operacoes.ts";
import type { RespostaProduto } from "../tipos/protocolo.ts";
import { formatarQuantidade, TEXTO_SEM_DESCRICAO } from "./formatacao-produto.ts";
import { interpretarIdRota } from "./id-rota.ts";

export const MENSAGEM_ID_PRODUTO_INVALIDO = "Identificador de produto inválido.";
export const TITULO_PRODUTO_NAO_ENCONTRADO = "Produto não encontrado.";
export const EXPLICACAO_PRODUTO_NAO_ENCONTRADO =
  "Ele pode ter sido excluído ou o endereço pode estar incorreto.";
export const MENSAGEM_FORA_PROTOCOLO_PRODUTO = "Resposta do servidor fora do protocolo.";

export type DestinoDetalheProduto = { tipo: "invalido" } | { tipo: "carregar"; id: number };

export type EstadoDetalheProduto =
  | { fase: "carregando"; id: number }
  | { fase: "sucesso"; id: number; produto: RespostaProduto }
  | { fase: "nao_encontrado"; id: number; explicacao: string }
  | { fase: "erro"; id: number; mensagem: string };

type FalhaOperacao = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;

export type AcaoDetalheProduto =
  | { tipo: "iniciar"; id: number }
  | { tipo: "recebido"; id: number; produto: RespostaProduto }
  | { tipo: "falhou"; id: number; falha: FalhaOperacao; mensagemPadrao404: string | undefined };

export interface ItemDetalheProduto {
  rotulo: string;
  valor: string;
  multilinha: boolean;
  vazio: boolean;
  esgotado: boolean;
}

export function decidirDestinoDetalheProduto(
  parametro: string | undefined,
): DestinoDetalheProduto {
  const id = interpretarIdRota(parametro);
  return id === null ? { tipo: "invalido" } : { tipo: "carregar", id };
}

export function criarEstadoDetalheProduto(id: number): EstadoDetalheProduto {
  return { fase: "carregando", id };
}

export function reduzirDetalheProduto(
  estado: EstadoDetalheProduto,
  acao: AcaoDetalheProduto,
): EstadoDetalheProduto {
  if (acao.tipo === "iniciar") {
    return { fase: "carregando", id: acao.id };
  }
  if (acao.id !== estado.id) {
    return estado;
  }
  if (acao.tipo === "recebido") {
    if (acao.produto.id !== estado.id) {
      return { fase: "erro", id: estado.id, mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO };
    }
    return { fase: "sucesso", id: estado.id, produto: acao.produto };
  }
  const { falha } = acao;
  if (falha.tipo === "http" && falha.status === 404) {
    const explicacao = falha.mensagem === acao.mensagemPadrao404
      ? EXPLICACAO_PRODUTO_NAO_ENCONTRADO
      : falha.mensagem;
    return { fase: "nao_encontrado", id: estado.id, explicacao };
  }
  return { fase: "erro", id: estado.id, mensagem: falha.mensagem };
}

export function montarItensDetalheProduto(produto: RespostaProduto): ItemDetalheProduto[] {
  const descricaoVazia = produto.descricao.trim() === "";
  return [
    {
      rotulo: "Identificador",
      valor: String(produto.id),
      multilinha: false,
      vazio: false,
      esgotado: false,
    },
    { rotulo: "Nome", valor: produto.nome, multilinha: false, vazio: false, esgotado: false },
    {
      rotulo: "Descrição",
      valor: descricaoVazia ? TEXTO_SEM_DESCRICAO : produto.descricao,
      multilinha: !descricaoVazia,
      vazio: descricaoVazia,
      esgotado: false,
    },
    {
      rotulo: "Quantidade",
      valor: formatarQuantidade(produto.quantidade),
      multilinha: false,
      vazio: false,
      esgotado: produto.quantidade === 0,
    },
  ];
}

export function textoSituacaoDetalheProduto(estado: EstadoDetalheProduto): string {
  if (estado.fase === "carregando") {
    return "Carregando dados do produto...";
  }
  if (estado.fase === "sucesso") {
    return "Dados do produto carregados.";
  }
  return "";
}
