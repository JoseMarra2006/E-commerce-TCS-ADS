import type { Hono } from "@hono/hono";
import type { AmbienteAplicacao } from "../../aplicacao.ts";
import { exigirAutenticacao } from "../../intermediarios/autenticacao.ts";
import { exigirAdministrador } from "../../intermediarios/autorizacao-administrador.ts";
import { registrarMetodosNaoPermitidos } from "../../intermediarios/metodo-nao-permitido.ts";
import {
  CAMINHO_PRODUTO,
  CAMINHO_PRODUTOS,
  montarCaminhoProduto,
} from "../../utilitarios/caminhos-api.ts";
import { criarRespostaErro } from "../../utilitarios/respostas-erro.ts";
import { criarRespostaJson } from "../../utilitarios/respostas-sucesso.ts";
import { paraRespostaProduto } from "./respostas-produtos.ts";
import {
  cadastrarProduto,
  listarTodosProdutos,
  obterProduto,
} from "./servico-produtos.ts";
import {
  validarCorpoCadastroProduto,
  validarIdProduto,
} from "./validacao-produtos.ts";

const MENSAGEM_PRODUTO_NAO_ENCONTRADO = "Produto não encontrado.";
const MENSAGEM_CADASTRO_RESTRITO =
  "Apenas administradores podem cadastrar produtos.";

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

  registrarMetodosNaoPermitidos(app, CAMINHO_PRODUTO, ["GET"]);
}
