import { createMiddleware } from "@hono/hono/factory";
import type { MiddlewareHandler } from "@hono/hono";
import type { AmbienteAutenticado } from "../aplicacao.ts";
import { criarRespostaErro } from "../utilitarios/respostas-erro.ts";

export function exigirAdministrador(
  mensagem: string,
): MiddlewareHandler<AmbienteAutenticado> {
  return createMiddleware<AmbienteAutenticado>(async (c, next) => {
    if (c.get("usuarioAutenticado").papel !== "administrador") {
      return criarRespostaErro(403, mensagem);
    }
    await next();
  });
}
