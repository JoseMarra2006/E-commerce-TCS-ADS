import { assert, assertEquals } from "@std/assert";
import type { RegistroMensagem } from "../../cliente/src/api/cliente-http.ts";
import type {
  Operacoes,
  ResultadoOperacao,
} from "../../cliente/src/api/operacoes.ts";
import type {
  RespostaSessao,
  RespostaUsuario,
} from "../../cliente/src/tipos/protocolo.ts";
import {
  iniciarServidorColega,
  type ModoColega,
  type OpcoesColega,
} from "../colega-simulado/servidor-colega.ts";
import {
  criarClienteDeTeste,
  exigirSucesso,
  iniciarIntermediario,
  iniciarServidorReal,
} from "./ambiente.ts";

export const EMAIL_ADM = "adm@teste.com";
export const SENHA_ADM = "admin123";
export const SENHA_CLIENTE = "SenhaCliente1";
export const ID_INEXISTENTE = 999999;

export interface ServidorAlvo {
  porta: number;
  encerrar: () => Promise<void>;
}

export interface Alvo {
  nome: string;
  iniciar: () => Promise<ServidorAlvo>;
}

export interface ContextoCliente {
  operacoes: Operacoes;
  registros: RegistroMensagem[];
  porta: number;
}

export interface UsuarioLogado {
  usuario: RespostaUsuario;
  sessao: RespostaSessao;
  token: string;
  email: string;
}

export const ALVO_REAL: Alvo = {
  nome: "servidor real",
  iniciar: async () => {
    const servidor = await iniciarServidorReal();
    return { porta: servidor.porta, encerrar: servidor.encerrar };
  },
};

export function alvoColega(
  modo: ModoColega,
  opcoes: OpcoesColega = {},
): Alvo {
  return {
    nome: `colega falso ${modo}`,
    iniciar: async () => {
      const colega = await iniciarServidorColega(modo, undefined, opcoes);
      return { porta: colega.porta, encerrar: colega.encerrar };
    },
  };
}

export const ALVOS_HONESTOS: readonly Alvo[] = [
  ALVO_REAL,
  alvoColega("correto"),
];

export async function comCliente(
  alvo: Alvo,
  corpo: (contexto: ContextoCliente) => Promise<void>,
): Promise<void> {
  const servidor = await alvo.iniciar();
  const intermediario = await iniciarIntermediario();
  const { operacoes, registros } = criarClienteDeTeste(
    intermediario.porta,
    () => ({ ip: "127.0.0.1", porta: servidor.porta }),
  );
  try {
    await corpo({ operacoes, registros, porta: servidor.porta });
  } finally {
    await intermediario.encerrar();
    await servidor.encerrar();
  }
}

export function emailUnico(prefixo: string): string {
  return `${prefixo}${crypto.randomUUID().slice(0, 8)}@teste.com`;
}

export async function entrarComoAdm(
  operacoes: Operacoes,
): Promise<UsuarioLogado> {
  const sessao = exigirSucesso(
    await operacoes.entrar({ email: EMAIL_ADM, senha: SENHA_ADM }),
  );
  return {
    usuario: sessao.usuario,
    sessao,
    token: sessao.token,
    email: EMAIL_ADM,
  };
}

export async function cadastrarUsuario(
  operacoes: Operacoes,
  prefixo: string,
  nome = "Cliente Teste",
): Promise<RespostaUsuario & { senha: string }> {
  const email = emailUnico(prefixo);
  const usuario = exigirSucesso(
    await operacoes.cadastrar({ nome, email, senha: SENHA_CLIENTE }),
  );
  assertEquals(usuario, { id: usuario.id, nome, email, admin: false });
  return { ...usuario, senha: SENHA_CLIENTE };
}

export async function cadastrarEEntrar(
  operacoes: Operacoes,
  prefixo: string,
): Promise<UsuarioLogado> {
  const usuario = await cadastrarUsuario(operacoes, prefixo);
  const sessao = exigirSucesso(
    await operacoes.entrar({ email: usuario.email, senha: SENHA_CLIENTE }),
  );
  assertEquals(sessao.usuario, {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    admin: false,
  });
  return {
    usuario: sessao.usuario,
    sessao,
    token: sessao.token,
    email: usuario.email,
  };
}

export function exigirFalhaHttp<T>(
  resultado: ResultadoOperacao<T>,
  status: number,
): string {
  if (resultado.ok) {
    throw new Error(`A operação deveria ter falhado com ${status}.`);
  }
  assertEquals(resultado.tipo, "http");
  assertEquals(resultado.status, status);
  assert(resultado.mensagem.trim().length > 0);
  return resultado.mensagem;
}

export function ultimoRegistro(
  registros: RegistroMensagem[],
  metodo: string,
): RegistroMensagem {
  const registro = registros.findLast((item) => item.metodo === metodo);
  assert(registro !== undefined, `nenhum registro ${metodo}`);
  return registro;
}
