import { ehAdministrador } from "../contextos/eh-administrador.ts";
import type { ResultadoOperacao } from "../api/operacoes.ts";
import type { RespostaUsuario } from "../tipos/protocolo.ts";
import { rotularTipoUsuario } from "./lista-usuarios.ts";

const PADRAO_DIGITOS_ASCII = /^[0-9]+$/;

export const MENSAGEM_ID_ROTA_INVALIDO = "Identificador de usuário inválido.";
export const TITULO_NAO_ENCONTRADO = "Usuário não encontrado.";
export const EXPLICACAO_NAO_ENCONTRADO =
  "Ele pode ter sido excluído ou o endereço pode estar incorreto.";
export const MENSAGEM_FORA_PROTOCOLO = "Resposta do servidor fora do protocolo.";

export type DestinoDetalhe =
  | { tipo: "invalido" }
  | { tipo: "perfil" }
  | { tipo: "carregar"; id: number };

export type EstadoDetalheUsuario =
  | { fase: "carregando"; id: number }
  | { fase: "sucesso"; id: number; usuario: RespostaUsuario }
  | { fase: "nao_encontrado"; id: number; explicacao: string }
  | { fase: "erro"; id: number; mensagem: string };

type FalhaOperacao = Extract<ResultadoOperacao<RespostaUsuario>, { ok: false }>;

export type AcaoDetalheUsuario =
  | { tipo: "iniciar"; id: number }
  | { tipo: "recebido"; id: number; usuario: RespostaUsuario }
  | { tipo: "falhou"; id: number; falha: FalhaOperacao; mensagemPadrao404: string | undefined };

export interface ItemDetalheUsuario {
  rotulo: string;
  valor: string;
  selo: "nenhum" | "administrador" | "comum";
}

export function interpretarIdRota(texto: string | undefined): number | null {
  if (texto === undefined || !PADRAO_DIGITOS_ASCII.test(texto)) {
    return null;
  }
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export function decidirDestinoDetalhe(
  parametro: string | undefined,
  idUsuarioSessao: number,
): DestinoDetalhe {
  const id = interpretarIdRota(parametro);
  if (id === null) {
    return { tipo: "invalido" };
  }
  if (id === idUsuarioSessao) {
    return { tipo: "perfil" };
  }
  return { tipo: "carregar", id };
}

export function criarEstadoDetalheUsuario(id: number): EstadoDetalheUsuario {
  return { fase: "carregando", id };
}

export function reduzirDetalheUsuario(
  estado: EstadoDetalheUsuario,
  acao: AcaoDetalheUsuario,
): EstadoDetalheUsuario {
  if (acao.tipo === "iniciar") {
    return { fase: "carregando", id: acao.id };
  }
  if (acao.id !== estado.id) {
    return estado;
  }
  if (acao.tipo === "recebido") {
    if (acao.usuario.id !== estado.id) {
      return { fase: "erro", id: estado.id, mensagem: MENSAGEM_FORA_PROTOCOLO };
    }
    return { fase: "sucesso", id: estado.id, usuario: acao.usuario };
  }
  const { falha } = acao;
  if (falha.tipo === "http" && falha.status === 404) {
    const explicacao = falha.mensagem === acao.mensagemPadrao404
      ? EXPLICACAO_NAO_ENCONTRADO
      : falha.mensagem;
    return { fase: "nao_encontrado", id: estado.id, explicacao };
  }
  return { fase: "erro", id: estado.id, mensagem: falha.mensagem };
}

export function montarItensDetalheUsuario(usuario: RespostaUsuario): ItemDetalheUsuario[] {
  const administrador = ehAdministrador(usuario);
  return [
    { rotulo: "Identificador", valor: String(usuario.id), selo: "nenhum" },
    { rotulo: "Nome", valor: usuario.nome, selo: "nenhum" },
    { rotulo: "E-mail", valor: usuario.email, selo: "nenhum" },
    {
      rotulo: "Tipo",
      valor: rotularTipoUsuario(administrador),
      selo: administrador ? "administrador" : "comum",
    },
  ];
}

export function textoSituacaoDetalhe(estado: EstadoDetalheUsuario): string {
  if (estado.fase === "carregando") {
    return "Carregando dados do usuário...";
  }
  if (estado.fase === "sucesso") {
    return "Dados do usuário carregados.";
  }
  return "";
}
