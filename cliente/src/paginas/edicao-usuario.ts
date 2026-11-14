import type { ResultadoOperacao } from "../api/operacoes.ts";
import type { CorpoAtualizacaoParcial, RespostaUsuario } from "../tipos/protocolo.ts";
import { validarFormularioEdicao } from "../validacao/validacao-campos.ts";
import type { ErrosCadastro, ResultadoFormularioEdicao } from "../validacao/validacao-campos.ts";
import {
  EXPLICACAO_NAO_ENCONTRADO,
  MENSAGEM_FORA_PROTOCOLO,
} from "./detalhe-usuario.ts";

export const MENSAGEM_NADA_ALTERADO = "Nenhuma alteração para salvar.";
export const MENSAGEM_EMAIL_EM_USO = "Este e-mail já está em uso por outro usuário.";
export const OBSERVACAO_TIPO_USUARIO =
  "O tipo do usuário (administrador ou comum) não pode ser alterado.";

export interface ValoresEdicaoUsuario {
  nome: string;
  email: string;
  senha: string;
}

export type CampoEdicaoUsuario = keyof ValoresEdicaoUsuario;

interface Formulario {
  id: number;
  atual: RespostaUsuario;
  valores: ValoresEdicaoUsuario;
}

export type EstadoEdicaoUsuario =
  | { fase: "carregando"; id: number }
  | { fase: "falha_carregamento"; id: number; mensagem: string }
  | { fase: "nao_encontrado"; id: number; explicacao: string }
  | ({ fase: "pronto"; aviso: string | null } & Formulario)
  | ({ fase: "salvando" } & Formulario)
  | ({ fase: "erro_campo"; erros: ErrosCadastro } & Formulario)
  | ({ fase: "erro_geral"; mensagem: string } & Formulario)
  | { fase: "concluido"; id: number; usuario: RespostaUsuario };

type FalhaOperacao = Extract<ResultadoOperacao<RespostaUsuario>, { ok: false }>;

export type AcaoEdicaoUsuario =
  | { tipo: "iniciar"; id: number }
  | { tipo: "carregado"; id: number; usuario: RespostaUsuario }
  | { tipo: "falha_carregamento"; id: number; falha: FalhaOperacao; mensagemPadrao404?: string }
  | { tipo: "alterar"; id: number; campo: CampoEdicaoUsuario; valor: string }
  | { tipo: "invalido"; id: number; erros: ErrosCadastro }
  | { tipo: "sem_alteracao"; id: number }
  | { tipo: "salvar"; id: number }
  | { tipo: "salvo"; id: number; usuario: RespostaUsuario }
  | { tipo: "falha_salvar"; id: number; falha: FalhaOperacao; mensagemPadrao404?: string };

export function calcularAlteracoes(
  atuais: RespostaUsuario,
  valores: ValoresEdicaoUsuario,
): CorpoAtualizacaoParcial | null {
  const alteracoes: CorpoAtualizacaoParcial = {};
  const nome = valores.nome.trim();
  const email = valores.email.trim();
  if (nome !== atuais.nome) {
    alteracoes.nome = nome;
  }
  if (email !== atuais.email) {
    alteracoes.email = email;
  }
  if (valores.senha !== "") {
    alteracoes.senha = valores.senha;
  }
  return Object.keys(alteracoes).length === 0 ? null : alteracoes;
}

export function validarEdicaoUsuario(
  valores: ValoresEdicaoUsuario,
  atuais: RespostaUsuario,
): ResultadoFormularioEdicao {
  return validarFormularioEdicao({ ...valores, email: valores.email.trim() }, atuais);
}

export function primeiroCampoInvalido(erros: ErrosCadastro): CampoEdicaoUsuario | null {
  if (erros.nome !== undefined) {
    return "nome";
  }
  if (erros.email !== undefined) {
    return "email";
  }
  if (erros.senha !== undefined) {
    return "senha";
  }
  return null;
}

export function criarEstadoEdicaoUsuario(id: number): EstadoEdicaoUsuario {
  return { fase: "carregando", id };
}

export function ehFormularioEditavel(
  estado: EstadoEdicaoUsuario,
): estado is Extract<EstadoEdicaoUsuario, { fase: "pronto" | "erro_campo" | "erro_geral" }> {
  return estado.fase === "pronto" || estado.fase === "erro_campo" ||
    estado.fase === "erro_geral";
}

export function podeEnviar(estado: EstadoEdicaoUsuario): boolean {
  return ehFormularioEditavel(estado);
}

function formularioDe(estado: Formulario): Formulario {
  return { id: estado.id, atual: estado.atual, valores: estado.valores };
}

function explicacao404(falha: FalhaOperacao, mensagemPadrao404: string | undefined): string {
  return falha.mensagem === mensagemPadrao404 ? EXPLICACAO_NAO_ENCONTRADO : falha.mensagem;
}

function alterarCampo(
  estado: Extract<EstadoEdicaoUsuario, { fase: "pronto" | "erro_campo" | "erro_geral" }>,
  campo: CampoEdicaoUsuario,
  valor: string,
): EstadoEdicaoUsuario {
  const formulario = { ...formularioDe(estado), valores: { ...estado.valores, [campo]: valor } };
  if (estado.fase === "erro_campo") {
    const erros: ErrosCadastro = { ...estado.erros };
    delete erros[campo];
    return primeiroCampoInvalido(erros) === null
      ? { fase: "pronto", aviso: null, ...formulario }
      : { fase: "erro_campo", erros, ...formulario };
  }
  if (estado.fase === "erro_geral") {
    return { fase: "erro_geral", mensagem: estado.mensagem, ...formulario };
  }
  return { fase: "pronto", aviso: null, ...formulario };
}

export function reduzirEdicaoUsuario(
  estado: EstadoEdicaoUsuario,
  acao: AcaoEdicaoUsuario,
): EstadoEdicaoUsuario {
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
      if (acao.usuario.id !== estado.id) {
        return { fase: "falha_carregamento", id: estado.id, mensagem: MENSAGEM_FORA_PROTOCOLO };
      }
      return {
        fase: "pronto",
        id: estado.id,
        atual: acao.usuario,
        valores: { nome: acao.usuario.nome, email: acao.usuario.email, senha: "" },
        aviso: null,
      };
    case "falha_carregamento":
      if (estado.fase !== "carregando") {
        return estado;
      }
      if (acao.falha.tipo === "http" && acao.falha.status === 404) {
        return {
          fase: "nao_encontrado",
          id: estado.id,
          explicacao: explicacao404(acao.falha, acao.mensagemPadrao404),
        };
      }
      return { fase: "falha_carregamento", id: estado.id, mensagem: acao.falha.mensagem };
    case "alterar":
      return ehFormularioEditavel(estado) ? alterarCampo(estado, acao.campo, acao.valor) : estado;
    case "invalido":
      return ehFormularioEditavel(estado)
        ? { fase: "erro_campo", erros: acao.erros, ...formularioDe(estado) }
        : estado;
    case "sem_alteracao":
      return ehFormularioEditavel(estado)
        ? { fase: "pronto", aviso: MENSAGEM_NADA_ALTERADO, ...formularioDe(estado) }
        : estado;
    case "salvar":
      return ehFormularioEditavel(estado)
        ? { fase: "salvando", ...formularioDe(estado) }
        : estado;
    case "salvo":
      if (estado.fase !== "salvando") {
        return estado;
      }
      if (acao.usuario.id !== estado.id) {
        return { fase: "erro_geral", mensagem: MENSAGEM_FORA_PROTOCOLO, ...formularioDe(estado) };
      }
      return { fase: "concluido", id: estado.id, usuario: acao.usuario };
    case "falha_salvar": {
      if (estado.fase !== "salvando") {
        return estado;
      }
      const { falha } = acao;
      if (falha.tipo === "http" && falha.status === 409) {
        return {
          fase: "erro_campo",
          erros: { email: MENSAGEM_EMAIL_EM_USO },
          ...formularioDe(estado),
        };
      }
      if (falha.tipo === "http" && falha.status === 404) {
        return {
          fase: "nao_encontrado",
          id: estado.id,
          explicacao: explicacao404(falha, acao.mensagemPadrao404),
        };
      }
      return { fase: "erro_geral", mensagem: falha.mensagem, ...formularioDe(estado) };
    }
  }
}
