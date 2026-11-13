/// <reference lib="deno.worker" />
import "../../src/pool/trabalhador.ts";

const TIPO_SINAL_RECUSADO = "teste_sinal_recusado";

const postarOriginal = self.postMessage.bind(self);

function ehSinal(mensagem: unknown): boolean {
  return typeof mensagem === "object" && mensagem !== null &&
    (mensagem as Record<string, unknown>).tipo === "sessoes_alteradas";
}

function postarComFalhaNoSinal(mensagem: unknown): void {
  if (ehSinal(mensagem)) {
    postarOriginal({ tipo: TIPO_SINAL_RECUSADO });
    throw new Error("Falha simulada ao enviar o sinal.");
  }
  postarOriginal(mensagem);
}

self.postMessage = postarComFalhaNoSinal;
