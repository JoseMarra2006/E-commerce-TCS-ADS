import { createMiddleware } from "@hono/hono/factory";
import type { AmbienteAutenticado } from "../aplicacao.ts";
import { buscarSessaoPorId } from "../modulos/sessoes/repositorio-sessoes.ts";
import { buscarUsuarioPorId } from "../modulos/usuarios/repositorio-usuarios.ts";
import { verificarTokenJwt } from "../utilitarios/jwt.ts";
import { criarRespostaErro } from "../utilitarios/respostas-erro.ts";

const PADRAO_CABECALHO_BEARER = /^Bearer ([^\s]+)$/;

const MENSAGEM_TOKEN_AUSENTE =
  "Token de acesso ausente. Faça login para continuar.";
const MENSAGEM_TOKEN_MAL_FORMATADO =
  "Token de acesso mal formatado. Use o formato: Authorization: Bearer <token>.";
const MENSAGEM_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";

export const exigirAutenticacao = createMiddleware<AmbienteAutenticado>(
  async (c, next) => {
    const cabecalho = c.req.header("Authorization");
    if (cabecalho === undefined || cabecalho.length === 0) {
      return criarRespostaErro(401, MENSAGEM_TOKEN_AUSENTE);
    }

    const correspondencia = PADRAO_CABECALHO_BEARER.exec(cabecalho);
    if (correspondencia === null) {
      return criarRespostaErro(401, MENSAGEM_TOKEN_MAL_FORMATADO);
    }

    const resultadoToken = await verificarTokenJwt(
      correspondencia[1],
      c.get("segredoJwt"),
    );
    if (!resultadoToken.ok) {
      return criarRespostaErro(401, MENSAGEM_TOKEN_INVALIDO);
    }

    const conexao = c.get("conexao");
    const sessao = buscarSessaoPorId(conexao, resultadoToken.sessaoId);
    if (sessao === null || sessao.usuarioId !== resultadoToken.usuarioId) {
      return criarRespostaErro(401, MENSAGEM_TOKEN_INVALIDO);
    }

    const usuario = buscarUsuarioPorId(conexao, resultadoToken.usuarioId);
    if (usuario === null) {
      return criarRespostaErro(401, MENSAGEM_TOKEN_INVALIDO);
    }

    c.set("usuarioAutenticado", usuario);
    c.set("sessaoAutenticada", sessao);
    await next();
  },
);
