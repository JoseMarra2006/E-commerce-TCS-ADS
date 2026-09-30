import { Hono } from "@hono/hono";
import { intermediarioCors } from "./intermediarios/cors.ts";
import { registrarRotasSessoes } from "./modulos/sessoes/rotas-sessoes.ts";
import { registrarRotasUsuarios } from "./modulos/usuarios/rotas-usuarios.ts";
import { MENSAGEM_ERRO_INTERNO } from "./utilitarios/respostas-erro.ts";
import type { ConexaoBanco } from "./banco/conexao.ts";
import type { UsuarioRegistro } from "./modulos/usuarios/tipos-usuarios.ts";
import type { SessaoRegistro } from "./modulos/sessoes/tipos-sessoes.ts";

export type AmbienteAplicacao = {
  Variables: { conexao: ConexaoBanco; segredoJwt: string };
};

export type AmbienteAutenticado = {
  Variables: AmbienteAplicacao["Variables"] & {
    usuarioAutenticado: UsuarioRegistro;
    sessaoAutenticada: SessaoRegistro;
  };
};

export interface OpcoesAplicacao {
  conexao: ConexaoBanco;
  segredoJwt: string;
}

export function criarAplicacao(
  opcoes: OpcoesAplicacao,
): Hono<AmbienteAplicacao> {
  const app = new Hono<AmbienteAplicacao>({ strict: false });

  app.use("*", intermediarioCors);

  app.use("*", async (c, next) => {
    c.set("conexao", opcoes.conexao);
    c.set("segredoJwt", opcoes.segredoJwt);
    await next();
  });

  registrarRotasUsuarios(app);
  registrarRotasSessoes(app);

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
