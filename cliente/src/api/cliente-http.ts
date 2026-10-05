import type { PedidoEnvio, ResultadoEnvio } from "../tipos/intermediario.ts";
import { mascararParaRegistro } from "./mascarar.ts";
import { lerResultadoEnvio } from "./validar-resultado-envio.ts";

export type MetodoHttp = PedidoEnvio["metodo"];
export type TipoFalha = "http" | "rede" | "intermediario" | "conexao";

export interface ConexaoServidor {
  ip: string;
  porta: number;
}

export interface RequisicaoHttp {
  metodo: MetodoHttp;
  caminho: string;
  token?: string;
  corpo?: unknown;
}

export type ResultadoHttp =
  | { ok: true; status: number; corpoTexto: string; cabecalhos: Record<string, string> }
  | {
    ok: false;
    tipo: TipoFalha;
    status: number | null;
    mensagem: string;
    corpoTexto: string | null;
  };

export interface RegistroMensagem {
  id: number;
  horario: string;
  metodo: string;
  url: string;
  autenticado: boolean;
  corpoEnviado: string | null;
  status: number | null;
  duracaoMs: number;
  corpoRecebido: string | null;
  erro: string | null;
}

export interface OpcoesClienteHttp {
  obterConexao: () => ConexaoServidor | null;
  aoRegistrar?: (registro: RegistroMensagem) => void;
  buscar?: typeof fetch;
  baseIntermediario?: string;
  tempoLimiteMs?: number;
}

export interface ClienteHttp {
  enviar: (requisicao: RequisicaoHttp) => Promise<ResultadoHttp>;
}

type Execucao =
  | { tipo: "resultado"; resultado: ResultadoEnvio }
  | { tipo: "falha"; mensagem: string };

interface RespostaIntermediario {
  status: number;
  json: unknown;
}

const TEMPO_LIMITE_PADRAO_MS = 15000;
const TAMANHO_MAXIMO_MENSAGEM = 300;

const MENSAGEM_SEM_CONEXAO = "Configure o IP e a porta do servidor antes de continuar.";
const MENSAGEM_INTERMEDIARIO_FORA =
  "O intermediário do cliente não está em execução. Feche e abra o cliente novamente.";
const MENSAGEM_INTERMEDIARIO_INESPERADO =
  "O intermediário do cliente respondeu de forma inesperada. Feche e abra o cliente novamente.";

const MENSAGENS_REDE: Record<string, string> = {
  conexao_recusada:
    "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução.",
  tempo_esgotado: "O servidor não respondeu a tempo. Verifique a conexão e tente novamente.",
  endereco_nao_encontrado: "Endereço do servidor não encontrado. Verifique o IP informado.",
  resposta_muito_grande: "A resposta do servidor é grande demais para ser processada.",
  falha_rede: "Falha de rede ao comunicar com o servidor.",
};

const MENSAGENS_STATUS: Record<number, string> = {
  400: "Os dados enviados foram recusados pelo servidor.",
  401: "Não autorizado. Faça login novamente.",
  403: "Você não tem permissão para realizar esta operação.",
  404: "Recurso não encontrado no servidor.",
  405: "O servidor não aceita esta operação nesta rota.",
  409: "Os dados informados entram em conflito com um cadastro existente.",
  500: "Erro interno no servidor.",
};

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function mensagemDoCorpo(corpoTexto: string): string | null {
  try {
    const dados: unknown = JSON.parse(corpoTexto);
    if (!ehObjeto(dados) || typeof dados.mensagem !== "string" || dados.mensagem.trim() === "") {
      return null;
    }
    const mensagem = dados.mensagem;
    return mensagem.length > TAMANHO_MAXIMO_MENSAGEM
      ? `${mensagem.slice(0, TAMANHO_MAXIMO_MENSAGEM)}...`
      : mensagem;
  } catch {
    return null;
  }
}

function mensagemDeErroHttp(status: number, corpoTexto: string): string {
  return mensagemDoCorpo(corpoTexto) ??
    MENSAGENS_STATUS[status] ??
    `O servidor respondeu com um erro inesperado (código ${status}).`;
}

async function chamar(
  buscar: typeof fetch,
  url: string,
  init: RequestInit,
  tempoLimiteMs: number,
): Promise<RespostaIntermediario | null> {
  const controlador = new AbortController();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => {
      controlador.abort();
      resolver(null);
    }, tempoLimiteMs);
  });

  const execucao = (async (): Promise<RespostaIntermediario | null> => {
    try {
      const resposta = await buscar(url, { ...init, signal: controlador.signal });
      const texto = await resposta.text();
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        json = undefined;
      }
      return { status: resposta.status, json };
    } catch {
      return null;
    }
  })();

  try {
    return await Promise.race([execucao, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

export function criarClienteHttp(opcoes: OpcoesClienteHttp): ClienteHttp {
  const buscar = opcoes.buscar ?? globalThis.fetch.bind(globalThis);
  const base = opcoes.baseIntermediario ?? "";
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  let promessaToken: Promise<string | null> | null = null;
  let proximoId = 1;

  async function buscarToken(): Promise<string | null> {
    const resposta = await chamar(
      buscar,
      `${base}/intermediario/token`,
      { method: "GET" },
      tempoLimiteMs,
    );
    if (resposta === null || resposta.status !== 200 || !ehObjeto(resposta.json)) {
      return null;
    }
    const token = resposta.json.token;
    return typeof token === "string" && token.length > 0 ? token : null;
  }

  function obterToken(): Promise<string | null> {
    if (promessaToken === null) {
      const atual = buscarToken().then((token) => {
        if (token === null && promessaToken === atual) {
          promessaToken = null;
        }
        return token;
      });
      promessaToken = atual;
    }
    return promessaToken;
  }

  async function executar(pedido: PedidoEnvio): Promise<Execucao> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const token = await obterToken();
      if (token === null) {
        return { tipo: "falha", mensagem: MENSAGEM_INTERMEDIARIO_FORA };
      }

      const resposta = await chamar(buscar, `${base}/intermediario/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Token-Intermediario": token },
        body: JSON.stringify(pedido),
      }, tempoLimiteMs);

      if (resposta === null) {
        return { tipo: "falha", mensagem: MENSAGEM_INTERMEDIARIO_FORA };
      }
      if (resposta.status === 403 && tentativa === 0) {
        promessaToken = null;
        continue;
      }
      if (resposta.status !== 200) {
        return { tipo: "falha", mensagem: MENSAGEM_INTERMEDIARIO_INESPERADO };
      }
      const resultado = lerResultadoEnvio(resposta.json);
      if (resultado === null) {
        return { tipo: "falha", mensagem: MENSAGEM_INTERMEDIARIO_INESPERADO };
      }
      return { tipo: "resultado", resultado };
    }
    return { tipo: "falha", mensagem: MENSAGEM_INTERMEDIARIO_INESPERADO };
  }

  function registrar(registro: Omit<RegistroMensagem, "id" | "horario">): void {
    if (opcoes.aoRegistrar === undefined) {
      return;
    }
    try {
      opcoes.aoRegistrar({
        id: proximoId++,
        horario: new Date().toISOString(),
        ...registro,
      });
    } catch {
      return;
    }
  }

  function converter(execucao: Execucao): ResultadoHttp {
    if (execucao.tipo === "falha") {
      return {
        ok: false,
        tipo: "intermediario",
        status: null,
        mensagem: execucao.mensagem,
        corpoTexto: null,
      };
    }
    const resultado = execucao.resultado;
    if (resultado.tipo === "erro_rede") {
      return {
        ok: false,
        tipo: "rede",
        status: null,
        mensagem: MENSAGENS_REDE[resultado.erro] ?? MENSAGENS_REDE["falha_rede"] ?? "",
        corpoTexto: null,
      };
    }
    if (resultado.status >= 200 && resultado.status <= 299) {
      return {
        ok: true,
        status: resultado.status,
        corpoTexto: resultado.corpo,
        cabecalhos: resultado.cabecalhos,
      };
    }
    return {
      ok: false,
      tipo: "http",
      status: resultado.status,
      mensagem: mensagemDeErroHttp(resultado.status, resultado.corpo),
      corpoTexto: resultado.corpo,
    };
  }

  async function processar(requisicao: RequisicaoHttp): Promise<ResultadoHttp> {
    const conexao = opcoes.obterConexao();
    if (conexao === null) {
      return {
        ok: false,
        tipo: "conexao",
        status: null,
        mensagem: MENSAGEM_SEM_CONEXAO,
        corpoTexto: null,
      };
    }

    const corpoTexto = requisicao.corpo === undefined
      ? null
      : (JSON.stringify(requisicao.corpo) ?? null);
    const pedido: PedidoEnvio = {
      ip: conexao.ip,
      porta: conexao.porta,
      metodo: requisicao.metodo,
      caminho: requisicao.caminho,
      token: requisicao.token ?? null,
      corpo: corpoTexto,
    };

    const inicio = performance.now();
    const execucao = await executar(pedido);
    const resultado = converter(execucao);
    const duracaoMs = Math.round(performance.now() - inicio);

    registrar({
      metodo: pedido.metodo,
      url: execucao.tipo === "resultado"
        ? execucao.resultado.url
        : `http://${pedido.ip}:${pedido.porta}${pedido.caminho}`,
      autenticado: pedido.token !== null,
      corpoEnviado: mascararParaRegistro(pedido.corpo),
      status: resultado.status,
      duracaoMs,
      corpoRecebido: mascararParaRegistro(
        execucao.tipo === "resultado" && execucao.resultado.tipo === "resposta"
          ? execucao.resultado.corpo
          : null,
      ),
      erro: !resultado.ok && resultado.tipo !== "http" ? resultado.mensagem : null,
    });

    return resultado;
  }

  return {
    enviar: async (requisicao) => {
      try {
        return await processar(requisicao);
      } catch {
        return {
          ok: false,
          tipo: "intermediario",
          status: null,
          mensagem: MENSAGEM_INTERMEDIARIO_INESPERADO,
          corpoTexto: null,
        };
      }
    },
  };
}
