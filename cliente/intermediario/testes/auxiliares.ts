import type { PedidoEnvio } from "../src/pedido-envio.ts";

export const DIRETORIO_FIXTURES = decodeURIComponent(
  new URL("./fixtures/dist", import.meta.url).pathname,
).replace(/^\/([A-Za-z]:)/, "$1");

export interface RequisicaoRegistrada {
  metodo: string;
  caminho: string;
  cabecalhos: Headers;
  corpo: Uint8Array;
}

export interface ServidorFalso {
  porta: number;
  requisicoes: RequisicaoRegistrada[];
  encerrar: () => Promise<void>;
}

export function iniciarServidorFalso(
  responder: (requisicao: Request) => Response | Promise<Response>,
): ServidorFalso {
  const requisicoes: RequisicaoRegistrada[] = [];
  const servidor = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    async (requisicao) => {
      const copia = requisicao.clone();
      requisicoes.push({
        metodo: requisicao.method,
        caminho: new URL(requisicao.url).pathname,
        cabecalhos: requisicao.headers,
        corpo: new Uint8Array(await copia.arrayBuffer()),
      });
      return responder(requisicao);
    },
  );
  return {
    porta: servidor.addr.port,
    requisicoes,
    encerrar: () => servidor.shutdown(),
  };
}

export function pedidoValido(substituicoes: Partial<Record<keyof PedidoEnvio, unknown>> = {}) {
  return {
    ip: "127.0.0.1",
    porta: 20000,
    metodo: "POST",
    caminho: "/api/v1/users",
    token: null,
    corpo: "{}",
    ...substituicoes,
  };
}

export function obterPortaLivre(): number {
  const ouvinte = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const porta = (ouvinte.addr as Deno.NetAddr).port;
  ouvinte.close();
  return porta;
}
