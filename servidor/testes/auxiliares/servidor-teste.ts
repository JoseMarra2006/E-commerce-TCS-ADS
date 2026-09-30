import { assertEquals } from "@std/assert";
import { ControladorServidor } from "../../src/controlador-servidor.ts";
import type { Registro } from "../../src/estado.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./banco-temporario.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./segredo-temporario.ts";

export interface ServidorDeTeste {
  urlBase: string;
  origem: string;
  caminhoBanco: string;
  controlador: ControladorServidor;
  registros: Registro[];
  encerrar: () => Promise<void>;
}

export interface OpcoesRequisicao {
  token?: string;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

export async function iniciarServidorDeTeste(): Promise<ServidorDeTeste> {
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
  const resultado = await controlador.iniciar(porta);
  if (!resultado.ok) {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
  assertEquals(resultado.ok, true, resultado.mensagem);

  const origem = `http://127.0.0.1:${porta}`;
  return {
    urlBase: `${origem}/api/v1`,
    origem,
    caminhoBanco,
    controlador,
    registros,
    encerrar: async () => {
      await controlador.parar();
      removerBancoTemporario(caminhoBanco);
      removerSegredoTemporario(caminhoSegredoJwt);
    },
  };
}

function codificarCorpo(corpo: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (corpo === undefined) {
    return undefined;
  }
  if (corpo instanceof Uint8Array) {
    return new Uint8Array(corpo);
  }
  const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return new TextEncoder().encode(texto);
}

export function requisitar(
  servidor: ServidorDeTeste,
  metodo: string,
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<Response> {
  const cabecalhos: Record<string, string> = {};
  const corpo = codificarCorpo(opcoes.corpo);
  if (corpo !== undefined && opcoes.cabecalhos === undefined) {
    cabecalhos["Content-Type"] = "application/json";
  }
  if (opcoes.token !== undefined) {
    cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
  }
  Object.assign(cabecalhos, opcoes.cabecalhos);

  return fetch(`${servidor.origem}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
}
