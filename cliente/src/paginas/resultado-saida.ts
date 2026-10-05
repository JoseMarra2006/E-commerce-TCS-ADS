import type { ResultadoOperacao } from "../api/operacoes.ts";

export interface AvisoSaida {
  tipo: "info" | "aviso";
  texto: string;
}

export function decidirAvisoSaida(resultado: ResultadoOperacao<true>): AvisoSaida {
  if (resultado.ok || (resultado.tipo === "http" && resultado.status === 401)) {
    return { tipo: "info", texto: "Você saiu da sua conta." };
  }
  return {
    tipo: "aviso",
    texto:
      `Você saiu da sua conta neste cliente, mas o servidor não confirmou o encerramento da sessão: ${resultado.mensagem}`,
  };
}
