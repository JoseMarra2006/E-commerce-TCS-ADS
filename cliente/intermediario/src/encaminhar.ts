import type { PedidoEnvio } from "./pedido-envio.ts";

export type ErroRede =
  | "conexao_recusada"
  | "tempo_esgotado"
  | "endereco_nao_encontrado"
  | "resposta_muito_grande"
  | "falha_rede";

export type ResultadoEnvio =
  | {
    tipo: "resposta";
    url: string;
    status: number;
    cabecalhos: Record<string, string>;
    corpo: string;
    duracaoMs: number;
  }
  | { tipo: "erro_rede"; url: string; erro: ErroRede; duracaoMs: number };

export interface OpcoesEncaminhamento {
  tempoLimiteMs?: number;
  tamanhoMaximoRespostaBytes?: number;
}

const TEMPO_LIMITE_PADRAO_MS = 10000;
const TAMANHO_MAXIMO_RESPOSTA_PADRAO_BYTES = 2 * 1024 * 1024;

const CODIGOS_CONEXAO_RECUSADA: Record<string, string> = {
  windows: "os error 10061",
  linux: "os error 111",
  darwin: "os error 61",
};

class RespostaMuitoGrande extends Error {}

function montarCabecalhos(pedido: PedidoEnvio): Headers {
  const cabecalhos = new Headers();
  if (pedido.corpo !== null) {
    cabecalhos.set("Content-Type", "application/json");
  }
  if (pedido.token !== null) {
    cabecalhos.set("Authorization", `Bearer ${pedido.token}`);
  }
  return cabecalhos;
}

function descreverErro(erro: unknown): string {
  const partes: string[] = [];
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 5 && atual instanceof Error; nivel++) {
    partes.push(atual.message);
    atual = atual.cause;
  }
  return partes.join(" | ").toLowerCase();
}

function ehCancelamento(erro: unknown): boolean {
  return erro instanceof DOMException &&
    (erro.name === "TimeoutError" || erro.name === "AbortError");
}

export function classificarFalha(erro: unknown): ErroRede {
  if (erro instanceof RespostaMuitoGrande) {
    return "resposta_muito_grande";
  }
  if (ehCancelamento(erro)) {
    return "tempo_esgotado";
  }
  const descricao = descreverErro(erro);
  if (descricao.includes("dns error") || descricao.includes("failed to lookup")) {
    return "endereco_nao_encontrado";
  }
  const codigoRecusada = CODIGOS_CONEXAO_RECUSADA[Deno.build.os];
  if (
    descricao.includes("connection refused") ||
    (codigoRecusada !== undefined && descricao.includes(codigoRecusada))
  ) {
    return "conexao_recusada";
  }
  return "falha_rede";
}

async function lerCorpoLimitado(resposta: Response, limiteBytes: number): Promise<string> {
  if (resposta.body === null) {
    return "";
  }
  const leitor = resposta.body.getReader();
  const blocos: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > limiteBytes) {
      await leitor.cancel();
      throw new RespostaMuitoGrande();
    }
    blocos.push(value);
  }
  const unido = new Uint8Array(total);
  let posicao = 0;
  for (const bloco of blocos) {
    unido.set(bloco, posicao);
    posicao += bloco.length;
  }
  return new TextDecoder().decode(unido);
}

export async function encaminharRequisicao(
  pedido: PedidoEnvio,
  opcoes: OpcoesEncaminhamento = {},
): Promise<ResultadoEnvio> {
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  const limiteBytes = opcoes.tamanhoMaximoRespostaBytes ?? TAMANHO_MAXIMO_RESPOSTA_PADRAO_BYTES;
  const url = `http://${pedido.ip}:${pedido.porta}${pedido.caminho}`;
  const inicio = performance.now();
  const duracao = () => Math.round(performance.now() - inicio);

  try {
    const resposta = await fetch(url, {
      method: pedido.metodo,
      headers: montarCabecalhos(pedido),
      body: pedido.corpo,
      redirect: "manual",
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
    const corpo = await lerCorpoLimitado(resposta, limiteBytes);
    const cabecalhos: Record<string, string> = {};
    resposta.headers.forEach((valor, nome) => {
      cabecalhos[nome.toLowerCase()] = valor;
    });
    return {
      tipo: "resposta",
      url,
      status: resposta.status,
      cabecalhos,
      corpo,
      duracaoMs: duracao(),
    };
  } catch (erro) {
    return { tipo: "erro_rede", url, erro: classificarFalha(erro), duracaoMs: duracao() };
  }
}
