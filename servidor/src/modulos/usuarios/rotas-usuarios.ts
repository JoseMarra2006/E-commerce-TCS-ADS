import type { Hono } from "@hono/hono";
import type { AmbienteAplicacao } from "../../aplicacao.ts";
import { registrarMetodosNaoPermitidos } from "../../intermediarios/metodo-nao-permitido.ts";
import {
  CAMINHO_USUARIOS,
  montarCaminhoUsuario,
} from "../../utilitarios/caminhos-api.ts";
import { criarRespostaErro } from "../../utilitarios/respostas-erro.ts";
import { criarRespostaJson } from "../../utilitarios/respostas-sucesso.ts";
import { paraRespostaUsuario } from "./respostas-usuarios.ts";
import { cadastrarUsuario } from "./servico-usuarios.ts";
import { validarCorpoCadastro } from "./validacao-usuarios.ts";

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
}
