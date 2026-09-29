import type { ConexaoBanco } from "../../banco/conexao.ts";
import { ehErroEmailDuplicado } from "../../banco/erros.ts";
import { gerarHashSenha } from "../../utilitarios/senha.ts";
import { buscarUsuarioPorEmail, criarUsuario } from "./repositorio-usuarios.ts";
import type { UsuarioRegistro } from "./tipos-usuarios.ts";

export type ResultadoCadastro =
  | { tipo: "criado"; usuario: UsuarioRegistro }
  | { tipo: "email_duplicado" };

export async function cadastrarUsuario(
  conexao: ConexaoBanco,
  dados: { nome: string; email: string; senha: string },
): Promise<ResultadoCadastro> {
  if (buscarUsuarioPorEmail(conexao, dados.email) !== null) {
    return { tipo: "email_duplicado" };
  }

  const { hash, salt } = await gerarHashSenha(dados.senha);

  try {
    const usuario = criarUsuario(conexao, {
      nome: dados.nome,
      email: dados.email,
      senhaHash: hash,
      senhaSalt: salt,
    });
    return { tipo: "criado", usuario };
  } catch (erro) {
    if (ehErroEmailDuplicado(erro)) {
      return { tipo: "email_duplicado" };
    }
    throw erro;
  }
}
