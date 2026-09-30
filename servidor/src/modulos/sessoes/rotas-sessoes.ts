import type { Hono } from "@hono/hono";
import type { AmbienteAplicacao } from "../../aplicacao.ts";
import { exigirAutenticacao } from "../../intermediarios/autenticacao.ts";
import { registrarMetodosNaoPermitidos } from "../../intermediarios/metodo-nao-permitido.ts";
import { verificarPosseSessao } from "../../intermediarios/posse.ts";
import {
  CAMINHO_SESSAO,
  CAMINHO_SESSOES,
  montarCaminhoSessao,
} from "../../utilitarios/caminhos-api.ts";
import { criarRespostaErro } from "../../utilitarios/respostas-erro.ts";
import {
  criarRespostaJson,
  criarRespostaSemConteudo,
} from "../../utilitarios/respostas-sucesso.ts";
import { validarCorpoLogin } from "../usuarios/validacao-usuarios.ts";
import { paraRespostaSessao } from "./respostas-sessoes.ts";
import { autenticarUsuario, encerrarSessao } from "./servico-sessoes.ts";

export function registrarRotasSessoes(app: Hono<AmbienteAplicacao>): void {
  app.post(CAMINHO_SESSOES, async (c) => {
    const texto = await c.req.text();
    const validacao = validarCorpoLogin(texto);
    if (!validacao.ok) {
      return criarRespostaErro(400, validacao.mensagem);
    }

    const resultado = await autenticarUsuario(
      c.get("conexao"),
      c.get("segredoJwt"),
      validacao.dados,
    );
    if (resultado.tipo === "credenciais_invalidas") {
      return criarRespostaErro(401, "E-mail ou senha inválidos.");
    }

    const { sessao, token, usuario } = resultado;
    return criarRespostaJson(
      201,
      paraRespostaSessao(sessao, token, usuario),
      {
        Location: montarCaminhoSessao(sessao.id),
        "Cache-Control": "no-store",
      },
    );
  });

  registrarMetodosNaoPermitidos(app, CAMINHO_SESSOES, ["POST"]);

  app.delete(CAMINHO_SESSAO, exigirAutenticacao, (c) => {
    const posse = verificarPosseSessao(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }

    if (!encerrarSessao(c.get("conexao"), posse.sessao.id)) {
      return criarRespostaErro(404, "Sessão não encontrada.");
    }

    return criarRespostaSemConteudo();
  });

  registrarMetodosNaoPermitidos(app, CAMINHO_SESSAO, ["DELETE"]);
}
