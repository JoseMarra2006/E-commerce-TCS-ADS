import type { Context, Hono } from "@hono/hono";
import { createMiddleware } from "@hono/hono/factory";
import type {
  AmbienteAplicacao,
  AmbienteAutenticado,
} from "../../aplicacao.ts";
import { exigirAutenticacao } from "../../intermediarios/autenticacao.ts";
import { exigirAdministrador } from "../../intermediarios/autorizacao-administrador.ts";
import { registrarMetodosNaoPermitidos } from "../../intermediarios/metodo-nao-permitido.ts";
import {
  CAMINHO_PRODUTO,
  CAMINHO_PRODUTOS,
  montarCaminhoProduto,
} from "../../utilitarios/caminhos-api.ts";
import { criarRespostaErro } from "../../utilitarios/respostas-erro.ts";
import {
  criarRespostaJson,
  criarRespostaSemConteudo,
} from "../../utilitarios/respostas-sucesso.ts";
import { paraRespostaProduto } from "./respostas-produtos.ts";
import {
  atualizarDadosProduto,
  cadastrarProduto,
  excluirProduto,
  listarTodosProdutos,
  obterProduto,
  substituirProduto,
} from "./servico-produtos.ts";
import type { ProdutoRegistro } from "./tipos-produtos.ts";
import {
  validarCorpoAtualizacaoParcialProduto,
  validarCorpoCadastroProduto,
  validarIdProduto,
} from "./validacao-produtos.ts";
import type { ResultadoValidacao } from "../usuarios/validacao-usuarios.ts";

const MENSAGEM_PRODUTO_NAO_ENCONTRADO = "Produto não encontrado.";
const MENSAGEM_CADASTRO_RESTRITO =
  "Apenas administradores podem cadastrar produtos.";
const MENSAGEM_ALTERACAO_RESTRITA =
  "Apenas administradores podem alterar produtos.";
const MENSAGEM_EXCLUSAO_RESTRITA =
  "Apenas administradores podem excluir produtos.";

type AmbienteProduto = {
  Variables: AmbienteAutenticado["Variables"] & { idProduto: number };
};

const exigirIdProdutoValido = createMiddleware<AmbienteProduto>(
  async (c, next) => {
    const validacao = validarIdProduto(c.req.param("id") ?? "");
    if (!validacao.ok) {
      return criarRespostaErro(400, validacao.mensagem);
    }
    c.set("idProduto", validacao.dados);
    await next();
  },
);

async function responderEscrita<T>(
  c: Context<AmbienteProduto>,
  validar: (texto: string) => ResultadoValidacao<T>,
  gravar: (id: number, dados: T) => ProdutoRegistro | undefined,
): Promise<Response> {
  const conexao = c.get("conexao");
  const id = c.get("idProduto");
  const validacao = validar(await c.req.text());

  if (!validacao.ok) {
    if (obterProduto(conexao, id) === undefined) {
      return criarRespostaErro(404, MENSAGEM_PRODUTO_NAO_ENCONTRADO);
    }
    return criarRespostaErro(400, validacao.mensagem);
  }

  const produto = gravar(id, validacao.dados);
  if (produto === undefined) {
    return criarRespostaErro(404, MENSAGEM_PRODUTO_NAO_ENCONTRADO);
  }

  return criarRespostaJson(200, paraRespostaProduto(produto));
}

export function registrarRotasProdutos(app: Hono<AmbienteAplicacao>): void {
  app.get(CAMINHO_PRODUTOS, exigirAutenticacao, (c) => {
    const produtos = listarTodosProdutos(c.get("conexao"));
    return criarRespostaJson(200, produtos.map(paraRespostaProduto));
  });

  app.post(
    CAMINHO_PRODUTOS,
    exigirAutenticacao,
    exigirAdministrador(MENSAGEM_CADASTRO_RESTRITO),
    async (c) => {
      const validacao = validarCorpoCadastroProduto(await c.req.text());
      if (!validacao.ok) {
        return criarRespostaErro(400, validacao.mensagem);
      }

      const produto = cadastrarProduto(c.get("conexao"), validacao.dados);
      return criarRespostaJson(201, paraRespostaProduto(produto), {
        Location: montarCaminhoProduto(produto.id),
      });
    },
  );

  registrarMetodosNaoPermitidos(app, CAMINHO_PRODUTOS, ["GET", "POST"]);

  app.get(CAMINHO_PRODUTO, exigirAutenticacao, (c) => {
    const validacaoId = validarIdProduto(c.req.param("id"));
    if (!validacaoId.ok) {
      return criarRespostaErro(400, validacaoId.mensagem);
    }

    const produto = obterProduto(c.get("conexao"), validacaoId.dados);
    if (produto === undefined) {
      return criarRespostaErro(404, MENSAGEM_PRODUTO_NAO_ENCONTRADO);
    }

    return criarRespostaJson(200, paraRespostaProduto(produto));
  });

  app.put(
    CAMINHO_PRODUTO,
    exigirAutenticacao,
    exigirIdProdutoValido,
    exigirAdministrador(MENSAGEM_ALTERACAO_RESTRITA),
    (c) =>
      responderEscrita(
        c,
        validarCorpoCadastroProduto,
        (id, dados) => substituirProduto(c.get("conexao"), id, dados),
      ),
  );

  app.patch(
    CAMINHO_PRODUTO,
    exigirAutenticacao,
    exigirIdProdutoValido,
    exigirAdministrador(MENSAGEM_ALTERACAO_RESTRITA),
    (c) =>
      responderEscrita(
        c,
        validarCorpoAtualizacaoParcialProduto,
        (id, dados) => atualizarDadosProduto(c.get("conexao"), id, dados),
      ),
  );

  app.delete(
    CAMINHO_PRODUTO,
    exigirAutenticacao,
    exigirIdProdutoValido,
    exigirAdministrador(MENSAGEM_EXCLUSAO_RESTRITA),
    (c) => {
      if (!excluirProduto(c.get("conexao"), c.get("idProduto"))) {
        return criarRespostaErro(404, MENSAGEM_PRODUTO_NAO_ENCONTRADO);
      }
      return criarRespostaSemConteudo();
    },
  );

  registrarMetodosNaoPermitidos(app, CAMINHO_PRODUTO, [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
  ]);
}
