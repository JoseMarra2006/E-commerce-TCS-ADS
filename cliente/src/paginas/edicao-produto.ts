import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import type { Operacoes, ResultadoOperacao } from "../api/operacoes.ts";
import type { RespostaProduto } from "../tipos/protocolo.ts";
import { quantidadeParaTexto, validarFormularioProduto } from "../validacao/validacao-produto.ts";
import type { CamposFormularioProduto, ErrosProduto } from "../validacao/validacao-produto.ts";
import {
  criarEstadoCadastroProduto,
  interpretarFalhaFormularioProduto,
  reduzirCadastroProduto,
} from "./cadastro-produto.ts";
import type {
  AcaoCadastroProduto,
  EstadoCadastroProduto,
  FalhaExibida,
} from "./cadastro-produto.ts";
import {
  EXPLICACAO_PRODUTO_NAO_ENCONTRADO,
  MENSAGEM_FORA_PROTOCOLO_PRODUTO,
} from "./detalhe-produto.ts";

export const MENSAGEM_SOMENTE_ADM_ALTERA = "Apenas administradores podem alterar produtos.";
export const APOIO_TENTAR_SALVAR = "Verifique a conexão e tente salvar novamente.";

type FalhaOperacao = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;

export type EstadoEdicaoProduto =
  | { fase: "carregando"; id: number }
  | { fase: "falha_carregamento"; id: number; mensagem: string }
  | { fase: "nao_encontrado"; id: number; explicacao: string }
  | { fase: "pronto"; id: number; formulario: EstadoCadastroProduto };

export type AcaoEdicaoProduto =
  | { tipo: "iniciar"; id: number }
  | { tipo: "carregado"; id: number; produto: RespostaProduto }
  | { tipo: "falha_carregamento"; id: number; falha: FalhaOperacao }
  | { tipo: "formulario"; id: number; acao: AcaoCadastroProduto }
  | { tipo: "nao_encontrado"; id: number; explicacao: string };

export type ResultadoEnvioEdicao =
  | { tipo: "invalido"; erros: ErrosProduto }
  | { tipo: "ignorado" }
  | { tipo: "salvo"; produto: RespostaProduto }
  | { tipo: "nao_encontrado"; explicacao: string }
  | { tipo: "nao_autorizado" }
  | { tipo: "falha"; falha: FalhaExibida };

export interface DependenciasEnvioEdicao {
  atualizarProduto: Operacoes["atualizarProduto"];
  token: string;
  id: number;
  trava: { current: boolean };
  aoIniciar?: () => void;
}

export function valoresIniciaisEdicao(produto: RespostaProduto): CamposFormularioProduto {
  return {
    nome: produto.nome,
    descricao: produto.descricao,
    quantidade: quantidadeParaTexto(produto.quantidade),
  };
}

export function explicacaoProdutoNaoEncontrado(falha: FalhaOperacao): string {
  return falha.mensagem.trim() === "" || falha.mensagem === obterMensagemPadraoStatus(404)
    ? EXPLICACAO_PRODUTO_NAO_ENCONTRADO
    : falha.mensagem;
}

function ehNaoEncontrado(falha: FalhaOperacao): boolean {
  return falha.tipo === "http" && falha.status === 404;
}

export function interpretarFalhaEdicao(falha: FalhaOperacao): FalhaExibida | null {
  return interpretarFalhaFormularioProduto(falha, {
    mensagem403: MENSAGEM_SOMENTE_ADM_ALTERA,
    apoio: APOIO_TENTAR_SALVAR,
  });
}

export function criarEstadoEdicaoProduto(id: number): EstadoEdicaoProduto {
  return { fase: "carregando", id };
}

export function reduzirEdicaoProduto(
  estado: EstadoEdicaoProduto,
  acao: AcaoEdicaoProduto,
): EstadoEdicaoProduto {
  if (acao.tipo === "iniciar") {
    return { fase: "carregando", id: acao.id };
  }
  if (acao.id !== estado.id) {
    return estado;
  }
  switch (acao.tipo) {
    case "carregado":
      if (estado.fase !== "carregando") {
        return estado;
      }
      if (acao.produto.id !== estado.id) {
        return {
          fase: "falha_carregamento",
          id: estado.id,
          mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO,
        };
      }
      return {
        fase: "pronto",
        id: estado.id,
        formulario: criarEstadoCadastroProduto(valoresIniciaisEdicao(acao.produto)),
      };
    case "falha_carregamento":
      if (estado.fase !== "carregando") {
        return estado;
      }
      if (ehNaoEncontrado(acao.falha)) {
        return {
          fase: "nao_encontrado",
          id: estado.id,
          explicacao: explicacaoProdutoNaoEncontrado(acao.falha),
        };
      }
      return { fase: "falha_carregamento", id: estado.id, mensagem: acao.falha.mensagem };
    case "formulario":
      if (estado.fase !== "pronto") {
        return estado;
      }
      return {
        fase: "pronto",
        id: estado.id,
        formulario: reduzirCadastroProduto(estado.formulario, acao.acao),
      };
    case "nao_encontrado":
      return { fase: "nao_encontrado", id: estado.id, explicacao: acao.explicacao };
  }
}

export async function enviarEdicaoProduto(
  dependencias: DependenciasEnvioEdicao,
  valores: CamposFormularioProduto,
): Promise<ResultadoEnvioEdicao> {
  if (dependencias.trava.current) {
    return { tipo: "ignorado" };
  }
  const validacao = validarFormularioProduto(valores);
  if (!validacao.ok) {
    return { tipo: "invalido", erros: validacao.erros };
  }
  dependencias.trava.current = true;
  dependencias.aoIniciar?.();
  try {
    const resultado = await dependencias.atualizarProduto(
      dependencias.id,
      dependencias.token,
      validacao.dados,
    );
    if (resultado.ok) {
      if (resultado.dados.id !== dependencias.id) {
        return {
          tipo: "falha",
          falha: { mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO, apoio: APOIO_TENTAR_SALVAR },
        };
      }
      return { tipo: "salvo", produto: resultado.dados };
    }
    if (ehNaoEncontrado(resultado)) {
      return { tipo: "nao_encontrado", explicacao: explicacaoProdutoNaoEncontrado(resultado) };
    }
    const falha = interpretarFalhaEdicao(resultado);
    return falha === null ? { tipo: "nao_autorizado" } : { tipo: "falha", falha };
  } finally {
    dependencias.trava.current = false;
  }
}
