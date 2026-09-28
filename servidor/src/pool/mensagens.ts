export type MensagemParaThread =
  | { tipo: "iniciar"; numero: number; caminhoBanco: string }
  | {
    tipo: "requisicao";
    id: number;
    metodo: string;
    url: string;
    cabecalhos: [string, string][];
    corpo: string | null;
  }
  | { tipo: "encerrar" };

export type MensagemDaThread =
  | { tipo: "pronta"; numero: number }
  | { tipo: "falha_inicializacao"; numero: number; mensagem: string }
  | {
    tipo: "resposta";
    id: number;
    status: number;
    cabecalhos: [string, string][];
    corpo: string | null;
    corpoRecebidoRegistro: string | null;
    corpoEnviadoRegistro: string | null;
  }
  | { tipo: "encerrada"; numero: number };

export function ehMensagemParaThread(
  dado: unknown,
): dado is MensagemParaThread {
  if (typeof dado !== "object" || dado === null) {
    return false;
  }

  const objeto = dado as Record<string, unknown>;

  if (typeof objeto.tipo !== "string") {
    return false;
  }

  if (objeto.tipo === "iniciar") {
    return (
      typeof objeto.numero === "number" &&
      typeof objeto.caminhoBanco === "string"
    );
  }

  if (objeto.tipo === "requisicao") {
    return (
      typeof objeto.id === "number" &&
      typeof objeto.metodo === "string" &&
      typeof objeto.url === "string" &&
      Array.isArray(objeto.cabecalhos) &&
      (typeof objeto.corpo === "string" || objeto.corpo === null)
    );
  }

  return objeto.tipo === "encerrar";
}

export function ehMensagemDaThread(dado: unknown): dado is MensagemDaThread {
  if (typeof dado !== "object" || dado === null) {
    return false;
  }

  const objeto = dado as Record<string, unknown>;

  if (typeof objeto.tipo !== "string") {
    return false;
  }

  if (objeto.tipo === "pronta") {
    return typeof objeto.numero === "number";
  }

  if (objeto.tipo === "falha_inicializacao") {
    return (
      typeof objeto.numero === "number" &&
      typeof objeto.mensagem === "string"
    );
  }

  if (objeto.tipo === "resposta") {
    return (
      typeof objeto.id === "number" &&
      typeof objeto.status === "number" &&
      Array.isArray(objeto.cabecalhos) &&
      (typeof objeto.corpo === "string" || objeto.corpo === null) &&
      (typeof objeto.corpoRecebidoRegistro === "string" ||
        objeto.corpoRecebidoRegistro === null) &&
      (typeof objeto.corpoEnviadoRegistro === "string" ||
        objeto.corpoEnviadoRegistro === null)
    );
  }

  if (objeto.tipo === "encerrada") {
    return typeof objeto.numero === "number";
  }

  return false;
}
