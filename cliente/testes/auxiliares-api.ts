import type { ErroRede, ResultadoEnvio } from "../src/tipos/intermediario.ts";

export interface ChamadaRegistrada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: string | null;
}

export type ManipuladorEnvio = (
  pedido: unknown,
  chamada: ChamadaRegistrada,
) => Response | Promise<Response>;

export interface IntermediarioFalso {
  buscar: typeof fetch;
  chamadas: ChamadaRegistrada[];
  pedidosEnviados: () => unknown[];
  tokensEmitidos: () => number;
}

export function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function resultadoResposta(
  status: number,
  corpo: string,
  url = "http://127.0.0.1:20000/api/v1/x",
): ResultadoEnvio {
  return {
    tipo: "resposta",
    url,
    status,
    cabecalhos: { "content-type": "application/json" },
    corpo,
    duracaoMs: 3,
  };
}

export function resultadoErroRede(erro: ErroRede): ResultadoEnvio {
  return { tipo: "erro_rede", url: "http://127.0.0.1:20000/api/v1/x", erro, duracaoMs: 3 };
}

export function criarIntermediarioFalso(aoEnviar: ManipuladorEnvio): IntermediarioFalso {
  const chamadas: ChamadaRegistrada[] = [];
  const pedidos: unknown[] = [];
  let tokens = 0;

  const buscar = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada);
    const corpo = typeof init?.body === "string" ? init.body : null;
    const chamada: ChamadaRegistrada = {
      url,
      metodo: init?.method ?? "GET",
      cabecalhos: Object.fromEntries(new Headers(init?.headers)),
      corpo,
    };
    chamadas.push(chamada);

    if (url.endsWith("/intermediario/token")) {
      tokens += 1;
      return respostaJson({ token: `token-intermediario-${tokens}` });
    }

    const pedido: unknown = corpo === null ? null : JSON.parse(corpo);
    pedidos.push(pedido);
    return aoEnviar(pedido, chamada);
  };

  return {
    buscar,
    chamadas,
    pedidosEnviados: () => pedidos,
    tokensEmitidos: () => tokens,
  };
}
