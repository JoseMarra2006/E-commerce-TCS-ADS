import type { Hono } from "@hono/hono";
import type { AmbienteAplicacao } from "../../aplicacao.ts";
import { exigirAutenticacao } from "../../intermediarios/autenticacao.ts";
import { registrarMetodosNaoPermitidos } from "../../intermediarios/metodo-nao-permitido.ts";
import { verificarPosseUsuario } from "../../intermediarios/posse.ts";
import {
  CAMINHO_USUARIO,
  CAMINHO_USUARIOS,
  montarCaminhoUsuario,
} from "../../utilitarios/caminhos-api.ts";
import { criarRespostaErro } from "../../utilitarios/respostas-erro.ts";
import {
  criarRespostaJson,
  criarRespostaSemConteudo,
} from "../../utilitarios/respostas-sucesso.ts";
import { paraRespostaUsuario } from "./respostas-usuarios.ts";
import {
  atualizarDadosUsuario,
  cadastrarUsuario,
  excluirConta,
  obterUsuario,
} from "./servico-usuarios.ts";
import type { ResultadoAtualizacao } from "./servico-usuarios.ts";
import {
  validarCorpoAtualizacaoParcial,
  validarCorpoCadastro,
} from "./validacao-usuarios.ts";

const MENSAGEM_NAO_ENCONTRADO = "Usuário não encontrado.";
const MENSAGEM_EMAIL_EM_USO =
  "Este e-mail já está sendo usado por outro usuário.";

function responderAtualizacao(resultado: ResultadoAtualizacao): Response {
  if (resultado.tipo === "email_duplicado") {
    return criarRespostaErro(409, MENSAGEM_EMAIL_EM_USO);
  }
  if (resultado.tipo === "nao_encontrado") {
    return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
  }
  return criarRespostaJson(200, paraRespostaUsuario(resultado.usuario));
}

export function registrarRotasUsuarios(app: Hono<AmbienteAplicacao>): void {
  app.post(CAMINHO_USUARIOS, async (c) => {
    const texto = await c.req.text();
    const validacao = validarCorpoCadastro(texto);
    if (!validacao.ok) {
      return criarRespostaErro(400, validacao.mensagem);
    }

    const resultado = await cadastrarUsuario(c.get("conexao"), validacao.dados);
    if (resultado.tipo === "email_duplicado") {
      return criarRespostaErro(
        409,
        "E-mail já cadastrado. Faça login para continuar.",
      );
    }

    return criarRespostaJson(
      201,
      paraRespostaUsuario(resultado.usuario),
      { Location: montarCaminhoUsuario(resultado.usuario.id) },
    );
  });

  registrarMetodosNaoPermitidos(app, CAMINHO_USUARIOS, ["POST"]);

  app.get(CAMINHO_USUARIO, exigirAutenticacao, (c) => {
    const posse = verificarPosseUsuario(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }

    const usuario = obterUsuario(c.get("conexao"), posse.id);
    if (usuario === null) {
      return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
    }

    return criarRespostaJson(200, paraRespostaUsuario(usuario));
  });

  app.put(CAMINHO_USUARIO, exigirAutenticacao, async (c) => {
    const posse = verificarPosseUsuario(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }

    const conexao = c.get("conexao");
    if (obterUsuario(conexao, posse.id) === null) {
      return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
    }

    const validacao = validarCorpoCadastro(await c.req.text());
    if (!validacao.ok) {
      return criarRespostaErro(400, validacao.mensagem);
    }

    return responderAtualizacao(
      await atualizarDadosUsuario(conexao, posse.id, validacao.dados),
    );
  });

  app.patch(CAMINHO_USUARIO, exigirAutenticacao, async (c) => {
    const posse = verificarPosseUsuario(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }

    const conexao = c.get("conexao");
    if (obterUsuario(conexao, posse.id) === null) {
      return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
    }

    const validacao = validarCorpoAtualizacaoParcial(await c.req.text());
    if (!validacao.ok) {
      return criarRespostaErro(400, validacao.mensagem);
    }

    return responderAtualizacao(
      await atualizarDadosUsuario(conexao, posse.id, validacao.dados),
    );
  });

  app.delete(CAMINHO_USUARIO, exigirAutenticacao, (c) => {
    const posse = verificarPosseUsuario(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }

    const conexao = c.get("conexao");
    if (obterUsuario(conexao, posse.id) === null) {
      return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
    }

    if (!excluirConta(conexao, posse.id)) {
      return criarRespostaErro(404, MENSAGEM_NAO_ENCONTRADO);
    }

    return criarRespostaSemConteudo();
  });

  registrarMetodosNaoPermitidos(app, CAMINHO_USUARIO, [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
  ]);
}
