import { assert, assertEquals } from "@std/assert";
import { ControladorServidor } from "../../servidor/src/controlador-servidor.ts";
import type { Registro } from "../../servidor/src/estado.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "../../servidor/testes/auxiliares/banco-temporario.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "../../servidor/testes/auxiliares/segredo-temporario.ts";
import "../../servidor/testes/auxiliares/vigia-arquivos-reais.ts";
import { criarAplicacaoIntermediario } from "../../cliente/intermediario/src/aplicacao-intermediario.ts";
import type { OpcoesEncaminhamento } from "../../cliente/intermediario/src/encaminhar.ts";
import {
  type ConexaoServidor,
  criarClienteHttp,
  type RegistroMensagem,
} from "../../cliente/src/api/cliente-http.ts";
import {
  criarOperacoes,
  type Operacoes,
  type ResultadoOperacao,
} from "../../cliente/src/api/operacoes.ts";

export interface ServidorReal {
  porta: number;
  registros: Registro[];
  controlador: ControladorServidor;
  parar: () => Promise<void>;
  reiniciar: () => Promise<void>;
  encerrar: () => Promise<void>;
}

export interface Intermediario {
  porta: number;
  token: string;
  encerrar: () => Promise<void>;
}

export interface OpcoesIntermediario {
  porta?: number;
  opcoesEncaminhamento?: OpcoesEncaminhamento;
}

export interface ClienteDeTeste {
  operacoes: Operacoes;
  registros: RegistroMensagem[];
}

export type RegistroRequisicao = Extract<Registro, { tipo: "requisicao" }>;

export function obterPortaLivre(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

export async function iniciarServidorReal(): Promise<ServidorReal> {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  const registros: Registro[] = [];
  controlador.addEventListener("registro", (evento) => {
    registros.push((evento as CustomEvent<Registro>).detail);
  });
  const porta = obterPortaLivre();

  async function parar(): Promise<void> {
    await controlador.parar();
  }

  async function limpar(): Promise<void> {
    await parar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }

  async function iniciar(): Promise<void> {
    const resultado = await controlador.iniciar(porta);
    if (!resultado.ok) {
      await limpar();
    }
    assertEquals(resultado.ok, true, resultado.mensagem);
  }

  await iniciar();

  return {
    porta,
    registros,
    controlador,
    parar,
    reiniciar: iniciar,
    encerrar: limpar,
  };
}

export function iniciarIntermediario(
  opcoes: OpcoesIntermediario = {},
): Promise<Intermediario> {
  const token = crypto.randomUUID();
  let portaAtual = 0;
  const app = criarAplicacaoIntermediario({
    token,
    obterPorta: () => portaAtual,
    modo: "desenvolvimento",
    opcoesEncaminhamento: opcoes.opcoesEncaminhamento,
  });
  const servidor = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: opcoes.porta ?? 0,
      onListen: () => {},
    },
    app.fetch,
  );
  assert(servidor.addr.transport === "tcp");
  portaAtual = servidor.addr.port;

  return Promise.resolve({
    porta: portaAtual,
    token,
    encerrar: async () => {
      await servidor.shutdown();
    },
  });
}

export function criarClienteDeTeste(
  portaIntermediario: number,
  obterConexao: () => ConexaoServidor | null,
): ClienteDeTeste {
  const origem = `http://127.0.0.1:${portaIntermediario}`;
  const registros: RegistroMensagem[] = [];
  const cliente = criarClienteHttp({
    obterConexao,
    baseIntermediario: origem,
    buscar: (entrada, init) => {
      const cabecalhos = new Headers(init?.headers);
      cabecalhos.set("Origin", origem);
      return fetch(entrada, { ...init, headers: cabecalhos });
    },
    aoRegistrar: (registro) => registros.push(registro),
  });
  return { operacoes: criarOperacoes(cliente), registros };
}

export function exigirSucesso<T>(resultado: ResultadoOperacao<T>): T {
  if (!resultado.ok) {
    throw new Error(
      `Operação falhou: ${resultado.tipo} ${resultado.status} ${resultado.mensagem}`,
    );
  }
  return resultado.dados;
}

export function exigirFalha<T>(
  resultado: ResultadoOperacao<T>,
  tipo: string,
  status: number | null,
): string {
  if (resultado.ok) {
    throw new Error("A operação deveria ter falhado.");
  }
  assertEquals(resultado.tipo, tipo);
  assertEquals(resultado.status, status);
  return resultado.mensagem;
}

export function apenasRequisicoes(registros: Registro[]): RegistroRequisicao[] {
  return registros.filter(
    (registro): registro is RegistroRequisicao =>
      registro.tipo === "requisicao",
  );
}
