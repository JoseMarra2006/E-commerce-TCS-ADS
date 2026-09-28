import { Hono } from "@hono/hono";
import { intermediarioCors } from "./intermediarios/cors.ts";
import { MENSAGEM_ERRO_INTERNO } from "./utilitarios/respostas-erro.ts";
import type { ConexaoBanco } from "./banco/conexao.ts";

export type AmbienteAplicacao = { Variables: { conexao: ConexaoBanco } };

export interface OpcoesAplicacao {
  conexao: ConexaoBanco;
}

export function criarAplicacao(
  opcoes: OpcoesAplicacao,
): Hono<AmbienteAplicacao> {
  const app = new Hono<AmbienteAplicacao>({ strict: false });

  app.use("*", intermediarioCors);

  app.use("*", async (c, next) => {
    c.set("conexao", opcoes.conexao);
    await next();
  });

  app.onError((_erro, c) => {
    return c.json({ mensagem: MENSAGEM_ERRO_INTERNO }, 500, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  app.notFound((c) => {
    return c.json({ mensagem: "Rota não encontrada." }, 404, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  return app;
}
