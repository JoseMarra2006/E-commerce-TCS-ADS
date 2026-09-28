/// <reference lib="deno.worker" />
import { criarAplicacao } from "../aplicacao.ts";
import { abrirConexao, fecharConexao } from "../banco/conexao.ts";
import type { ConexaoBanco } from "../banco/conexao.ts";
import { mascararCorpoParaRegistro } from "../utilitarios/mascarar.ts";
import {
  CABECALHOS_CORS_ENTRADAS,
  MENSAGEM_ERRO_INTERNO,
} from "../utilitarios/respostas-erro.ts";
import { ehMensagemParaThread } from "./mensagens.ts";
import type { MensagemDaThread, MensagemParaThread } from "./mensagens.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;
type MensagemRequisicao = Extract<MensagemParaThread, { tipo: "requisicao" }>;

let numeroThreadAtual: number | null = null;
let aplicacao: Aplicacao | null = null;
let conexaoAtual: ConexaoBanco | null = null;

function enviarMensagem(mensagem: MensagemDaThread): void {
  self.postMessage(mensagem);
}

function montarRespostaDeErro(mensagem: MensagemRequisicao): MensagemDaThread {
  const corpoErro = JSON.stringify({ mensagem: MENSAGEM_ERRO_INTERNO });

  return {
    tipo: "resposta",
    id: mensagem.id,
    status: 500,
    cabecalhos: [
      ["Content-Type", "application/json; charset=utf-8"],
      ...CABECALHOS_CORS_ENTRADAS,
    ],
    corpo: corpoErro,
    corpoRecebidoRegistro: mascararCorpoParaRegistro(mensagem.corpo),
    corpoEnviadoRegistro: mascararCorpoParaRegistro(corpoErro),
  };
}

async function processarRequisicao(
  mensagem: MensagemRequisicao,
): Promise<void> {
  try {
    if (aplicacao === null) {
      throw new Error("A aplicação da thread não foi iniciada.");
    }

    const corpoRecebidoRegistro = mascararCorpoParaRegistro(mensagem.corpo);
    const metodoSemCorpo = mensagem.metodo === "GET" ||
      mensagem.metodo === "HEAD";

    const opcoesRequisicao: RequestInit = {
      method: mensagem.metodo,
      headers: mensagem.cabecalhos,
    };

    if (!metodoSemCorpo && mensagem.corpo !== null) {
      opcoesRequisicao.body = mensagem.corpo;
    }

    const requisicao = new Request(mensagem.url, opcoesRequisicao);
    const resposta = await aplicacao.fetch(requisicao);

    const textoResposta = await resposta.text();
    const corpoResposta = resposta.status === 204 || resposta.status === 304 ||
        textoResposta.length === 0
      ? null
      : textoResposta;

    enviarMensagem({
      tipo: "resposta",
      id: mensagem.id,
      status: resposta.status,
      cabecalhos: Array.from(resposta.headers),
      corpo: corpoResposta,
      corpoRecebidoRegistro,
      corpoEnviadoRegistro: mascararCorpoParaRegistro(corpoResposta),
    });
  } catch {
    enviarMensagem(montarRespostaDeErro(mensagem));
  }
}

self.onmessage = (evento: MessageEvent<unknown>) => {
  const mensagem = evento.data;

  if (!ehMensagemParaThread(mensagem)) {
    return;
  }

  if (mensagem.tipo === "iniciar") {
    numeroThreadAtual = mensagem.numero;
    try {
      conexaoAtual = abrirConexao(mensagem.caminhoBanco);
    } catch (erro) {
      const mensagemErro = erro instanceof Error
        ? erro.message
        : "Não foi possível abrir o banco de dados.";
      enviarMensagem({
        tipo: "falha_inicializacao",
        numero: numeroThreadAtual,
        mensagem: mensagemErro,
      });
      return;
    }
    aplicacao = criarAplicacao({ conexao: conexaoAtual });
    enviarMensagem({ tipo: "pronta", numero: numeroThreadAtual });
    return;
  }

  if (mensagem.tipo === "requisicao") {
    void processarRequisicao(mensagem);
    return;
  }

  if (mensagem.tipo === "encerrar") {
    if (conexaoAtual !== null) {
      fecharConexao(conexaoAtual);
      conexaoAtual = null;
    }
    enviarMensagem({ tipo: "encerrada", numero: numeroThreadAtual ?? 0 });
    self.close();
  }
};
