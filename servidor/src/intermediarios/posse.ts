import type { Context } from "@hono/hono";
import type { AmbienteAutenticado } from "../aplicacao.ts";
import { buscarSessaoPorId } from "../modulos/sessoes/repositorio-sessoes.ts";
import type { SessaoRegistro } from "../modulos/sessoes/tipos-sessoes.ts";
import { validarIdUsuario } from "../modulos/usuarios/validacao-usuarios.ts";
import { criarRespostaErro } from "../utilitarios/respostas-erro.ts";

export type ResultadoPosseUsuario =
  | { ok: true; id: number }
  | { ok: false; resposta: Response };

export type ResultadoPosseSessao =
  | { ok: true; sessao: SessaoRegistro }
  | { ok: false; resposta: Response };

export function verificarPosseUsuario(
  c: Context<AmbienteAutenticado>,
  idTexto: string,
): ResultadoPosseUsuario {
  const validacao = validarIdUsuario(idTexto);
  if (!validacao.ok) {
    return { ok: false, resposta: criarRespostaErro(400, validacao.mensagem) };
  }

  if (validacao.dados !== c.get("usuarioAutenticado").id) {
    return {
      ok: false,
      resposta: criarRespostaErro(
        403,
        "Você não tem permissão para acessar os dados de outro usuário.",
      ),
    };
  }

  return { ok: true, id: validacao.dados };
}

export function verificarPosseSessao(
  c: Context<AmbienteAutenticado>,
  idSessao: string,
): ResultadoPosseSessao {
  const sessao = buscarSessaoPorId(c.get("conexao"), idSessao);

  if (sessao === null || sessao.usuarioId !== c.get("usuarioAutenticado").id) {
    return {
      ok: false,
      resposta: criarRespostaErro(
        403,
        "Você não tem permissão para encerrar esta sessão.",
      ),
    };
  }

  return { ok: true, sessao };
}
