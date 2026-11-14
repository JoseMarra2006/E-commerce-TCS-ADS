import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import type { Operacoes, ResultadoOperacao } from "../api/operacoes.ts";
import { criarEstadoAvisoProduto } from "./aviso-produto.ts";
import type { EstadoAvisoProduto } from "./aviso-produto.ts";
import { CAMINHO_LISTA_PRODUTOS } from "./caminhos-produtos.ts";

export const TITULO_DIALOGO_EXCLUSAO_PRODUTO = "Excluir produto?";
export const ROTULO_CONFIRMAR_EXCLUSAO_PRODUTO = "Excluir";
export const ROTULO_EXCLUINDO_PRODUTO = "Excluindo...";
export const MENSAGEM_SOMENTE_ADM_EXCLUI = "Apenas administradores podem excluir produtos.";
export const MENSAGEM_FALHA_EXCLUSAO_PRODUTO =
  "Não foi possível excluir o produto. Verifique a conexão e tente novamente.";

export interface EstadoExclusaoProduto {
  fase: "ociosa" | "confirmando" | "excluindo";
  id: number;
  erroDialogo: string | null;
  erroPagina: string | null;
}

export type AcaoExclusaoProduto =
  | { tipo: "iniciar"; id: number }
  | { tipo: "abrir"; id: number }
  | { tipo: "cancelar"; id: number }
  | { tipo: "iniciar_envio"; id: number }
  | { tipo: "falha_dialogo"; id: number; mensagem: string }
  | { tipo: "falha_pagina"; id: number; mensagem: string }
  | { tipo: "fim"; id: number };

export type ResultadoEnvioExclusao =
  | { tipo: "ignorado" }
  | { tipo: "excluido" }
  | { tipo: "ja_excluido" }
  | { tipo: "nao_autorizado" }
  | { tipo: "proibido"; mensagem: string }
  | { tipo: "falha"; mensagem: string };

export interface DependenciasEnvioExclusao {
  excluirProduto: Operacoes["excluirProduto"];
  token: string;
  id: number;
  trava: { current: boolean };
  aoIniciar?: () => void;
}

export function textoDialogoExclusaoProduto(nome: string): string {
  return `O produto ${nome} será excluído permanentemente. Esta ação não pode ser desfeita.`;
}

export function criarEstadoExclusaoProduto(id: number): EstadoExclusaoProduto {
  return { fase: "ociosa", id, erroDialogo: null, erroPagina: null };
}

export function dialogoExclusaoProdutoAberto(estado: EstadoExclusaoProduto): boolean {
  return estado.fase !== "ociosa";
}

export function textoErroDialogoExclusao(estado: EstadoExclusaoProduto): string | undefined {
  return estado.erroDialogo === null
    ? undefined
    : `${MENSAGEM_FALHA_EXCLUSAO_PRODUTO} ${estado.erroDialogo}`;
}

export function reduzirExclusaoProduto(
  estado: EstadoExclusaoProduto,
  acao: AcaoExclusaoProduto,
): EstadoExclusaoProduto {
  if (acao.tipo === "iniciar") {
    return criarEstadoExclusaoProduto(acao.id);
  }
  if (acao.id !== estado.id) {
    return estado;
  }
  switch (acao.tipo) {
    case "abrir":
      return estado.fase === "ociosa"
        ? { ...estado, fase: "confirmando", erroDialogo: null, erroPagina: null }
        : estado;
    case "cancelar":
      return estado.fase === "confirmando"
        ? { ...estado, fase: "ociosa", erroDialogo: null }
        : estado;
    case "iniciar_envio":
      return estado.fase === "confirmando"
        ? { ...estado, fase: "excluindo", erroDialogo: null }
        : estado;
    case "falha_dialogo":
      return estado.fase === "excluindo"
        ? { ...estado, fase: "confirmando", erroDialogo: acao.mensagem }
        : estado;
    case "falha_pagina":
      return estado.fase === "excluindo"
        ? { ...estado, fase: "ociosa", erroDialogo: null, erroPagina: acao.mensagem }
        : estado;
    case "fim":
      return estado.fase === "excluindo" ? { ...estado, fase: "ociosa" } : estado;
  }
}

function mensagem403(resultado: Extract<ResultadoOperacao<true>, { ok: false }>): string {
  const generica = obterMensagemPadraoStatus(403);
  return resultado.mensagem.trim() === "" || resultado.mensagem === generica
    ? MENSAGEM_SOMENTE_ADM_EXCLUI
    : resultado.mensagem;
}

export async function enviarExclusaoProduto(
  dependencias: DependenciasEnvioExclusao,
): Promise<ResultadoEnvioExclusao> {
  if (dependencias.trava.current) {
    return { tipo: "ignorado" };
  }
  dependencias.trava.current = true;
  dependencias.aoIniciar?.();
  try {
    const resultado = await dependencias.excluirProduto(dependencias.id, dependencias.token);
    if (resultado.ok) {
      return { tipo: "excluido" };
    }
    if (resultado.tipo === "http" && resultado.status === 404) {
      return { tipo: "ja_excluido" };
    }
    if (resultado.tipo === "http" && resultado.status === 401) {
      return { tipo: "nao_autorizado" };
    }
    if (resultado.tipo === "http" && resultado.status === 403) {
      return { tipo: "proibido", mensagem: mensagem403(resultado) };
    }
    return { tipo: "falha", mensagem: resultado.mensagem };
  } finally {
    dependencias.trava.current = false;
  }
}

export function destinoAposExclusao(
  resultado: ResultadoEnvioExclusao,
): { para: string; estado: EstadoAvisoProduto } | null {
  if (resultado.tipo === "excluido") {
    return { para: CAMINHO_LISTA_PRODUTOS, estado: criarEstadoAvisoProduto("excluido") };
  }
  if (resultado.tipo === "ja_excluido") {
    return { para: CAMINHO_LISTA_PRODUTOS, estado: criarEstadoAvisoProduto("ja_excluido") };
  }
  return null;
}
