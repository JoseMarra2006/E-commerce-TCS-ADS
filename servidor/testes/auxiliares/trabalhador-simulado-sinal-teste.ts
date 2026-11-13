/// <reference lib="deno.worker" />
import { ehMensagemParaThread } from "../../src/pool/mensagens.ts";
import type {
  MensagemDaThread,
  MensagemParaThread,
} from "../../src/pool/mensagens.ts";

type MensagemRequisicao = Extract<MensagemParaThread, { tipo: "requisicao" }>;

const ATRASO_MS = 150;

let numeroAtual = 0;

function enviar(mensagem: MensagemDaThread | Record<string, unknown>): void {
  self.postMessage(mensagem);
}

function responder(mensagem: MensagemRequisicao): void {
  enviar({
    tipo: "resposta",
    id: mensagem.id,
    status: 200,
    cabecalhos: [],
    corpo: null,
    corpoRecebidoRegistro: null,
    corpoEnviadoRegistro: null,
  });
}

function sinalizar(): void {
  enviar({ tipo: "sessoes_alteradas" });
}

function tratarRequisicao(mensagem: MensagemRequisicao): void {
  const caminho = new URL(mensagem.url).pathname;

  if (caminho === "/sinal") {
    sinalizar();
    responder(mensagem);
    return;
  }

  if (caminho === "/sinal-antes-de-responder") {
    sinalizar();
    setTimeout(() => responder(mensagem), ATRASO_MS);
    return;
  }

  if (caminho === "/sinal-invalido") {
    enviar({ tipo: "sessoes_alteradas", extra: 1 });
    enviar({ tipo: "Sessoes_Alteradas" });
    enviar({ tipo: "sessoes_alteradas", numero: numeroAtual });
    responder(mensagem);
    return;
  }

  if (caminho === "/sinal-adiado") {
    responder(mensagem);
    setTimeout(sinalizar, ATRASO_MS);
    return;
  }

  responder(mensagem);
}

self.onmessage = (evento: MessageEvent<unknown>) => {
  const mensagem = evento.data;

  if (!ehMensagemParaThread(mensagem)) {
    return;
  }

  if (mensagem.tipo === "iniciar") {
    numeroAtual = mensagem.numero;
    enviar({ tipo: "pronta", numero: numeroAtual });
    return;
  }

  if (mensagem.tipo === "requisicao") {
    tratarRequisicao(mensagem);
    return;
  }

  sinalizar();
  enviar({ tipo: "encerrada", numero: numeroAtual });
  self.close();
};
