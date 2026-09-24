import type { MiddlewareHandler } from "@hono/hono";
import { CABECALHOS_CORS } from "../utilitarios/respostas-erro.ts";

export const intermediarioCors: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CABECALHOS_CORS,
    });
  }

  await next();

  for (const nomeCabecalho of Object.keys(CABECALHOS_CORS)) {
    c.res.headers.set(nomeCabecalho, CABECALHOS_CORS[nomeCabecalho]);
  }
};
