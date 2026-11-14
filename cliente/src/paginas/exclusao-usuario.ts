import type { ResultadoOperacao } from "../api/operacoes.ts";
import type { RespostaUsuario } from "../tipos/protocolo.ts";
import { criarEstadoAvisoUsuario } from "./aviso-usuario.ts";
import type { EstadoAvisoUsuario } from "./aviso-usuario.ts";
import { CAMINHO_LISTA_USUARIOS } from "./caminhos-usuarios.ts";

export const TITULO_DIALOGO_EXCLUSAO_USUARIO = "Excluir usuário?";
export const ROTULO_CONFIRMAR_EXCLUSAO_USUARIO = "Excluir";
export const ROTULO_EXCLUINDO_USUARIO = "Excluindo...";

export type EstadoExclusaoUsuario =
  | { fase: "ociosa"; id: number }
  | { fase: "confirmando"; id: number }
  | { fase: "excluindo"; id: number }
  | { fase: "erro"; id: number; mensagem: string }
  | { fase: "concluida"; id: number }
  | { fase: "ja_excluida"; id: number };

export type AcaoExclusaoUsuario =
  | { tipo: "iniciar"; id: number }
  | { tipo: "abrir"; id: number }
  | { tipo: "cancelar"; id: number }
  | { tipo: "confirmar"; id: number }
  | { tipo: "resultado"; id: number; resultado: ResultadoOperacao<true> };

export type DestinoExclusaoUsuario =
  | { tipo: "navegar"; para: string; estado: EstadoAvisoUsuario }
  | { tipo: "permanecer" };

function ehNaoEncontrado(resultado: ResultadoOperacao<true>): boolean {
  return !resultado.ok && resultado.tipo === "http" && resultado.status === 404;
}

export function criarEstadoExclusaoUsuario(id: number): EstadoExclusaoUsuario {
  return { fase: "ociosa", id };
}

export function dialogoExclusaoAberto(estado: EstadoExclusaoUsuario): boolean {
  return estado.fase === "confirmando" || estado.fase === "excluindo";
}

export function reduzirExclusaoUsuario(
  estado: EstadoExclusaoUsuario,
  acao: AcaoExclusaoUsuario,
): EstadoExclusaoUsuario {
  if (acao.tipo === "iniciar") {
    return { fase: "ociosa", id: acao.id };
  }
  if (acao.id !== estado.id) {
    return estado;
  }
  switch (acao.tipo) {
    case "abrir":
      return estado.fase === "ociosa" || estado.fase === "erro"
        ? { fase: "confirmando", id: estado.id }
        : estado;
    case "cancelar":
      return estado.fase === "confirmando" ? { fase: "ociosa", id: estado.id } : estado;
    case "confirmar":
      return estado.fase === "confirmando" ? { fase: "excluindo", id: estado.id } : estado;
    case "resultado": {
      if (estado.fase !== "excluindo") {
        return estado;
      }
      const { resultado } = acao;
      if (resultado.ok) {
        return { fase: "concluida", id: estado.id };
      }
      if (ehNaoEncontrado(resultado)) {
        return { fase: "ja_excluida", id: estado.id };
      }
      return { fase: "erro", id: estado.id, mensagem: resultado.mensagem };
    }
  }
}

export function decidirDestinoExclusao(resultado: ResultadoOperacao<true>): DestinoExclusaoUsuario {
  if (resultado.ok) {
    return {
      tipo: "navegar",
      para: CAMINHO_LISTA_USUARIOS,
      estado: criarEstadoAvisoUsuario("excluido"),
    };
  }
  if (ehNaoEncontrado(resultado)) {
    return {
      tipo: "navegar",
      para: CAMINHO_LISTA_USUARIOS,
      estado: criarEstadoAvisoUsuario("ja_excluido"),
    };
  }
  return { tipo: "permanecer" };
}

export function textoDialogoExclusaoUsuario(usuario: RespostaUsuario): string {
  return `Você está prestes a excluir ${usuario.nome} (${usuario.email}). Esta ação não pode ser desfeita. As sessões abertas desse usuário também serão encerradas.`;
}
