import { Hono } from "@hono/hono";
import { intermediarioCors } from "./intermediarios/cors.ts";
import { MENSAGEM_ERRO_INTERNO } from "./utilitarios/respostas-erro.ts";

export function criarAplicacao(): Hono {
  const app = new Hono({ strict: false });

  app.use("*", intermediarioCors);

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
