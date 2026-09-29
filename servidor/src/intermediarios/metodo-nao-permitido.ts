import type { Hono } from "@hono/hono";
import type { AmbienteAplicacao } from "../aplicacao.ts";
import { criarRespostaErro } from "../utilitarios/respostas-erro.ts";

function montarMetodosAllow(metodosPermitidos: readonly string[]): string {
  const metodos = metodosPermitidos.flatMap((metodo) =>
    metodo === "GET" ? ["GET", "HEAD"] : [metodo]
  );
  return [...metodos, "OPTIONS"].join(", ");
}

export function registrarMetodosNaoPermitidos(
  app: Hono<AmbienteAplicacao>,
  caminho: string,
  metodosPermitidos: readonly string[],
): void {
  const allow = montarMetodosAllow(metodosPermitidos);

  app.all(caminho, () => {
    const resposta = criarRespostaErro(405, "Método não permitido nesta rota.");
    resposta.headers.set("Allow", allow);
    return resposta;
  });
}
