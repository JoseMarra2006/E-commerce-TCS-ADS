import type { ConexaoBanco } from "../../banco/conexao.ts";
import { ehErroEmailDuplicado } from "../../banco/erros.ts";
import { gerarHashSenha } from "../../utilitarios/senha.ts";
import {
  atualizarUsuario,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  criarUsuario,
  emailPertenceAOutroUsuario,
  excluirUsuario,
} from "./repositorio-usuarios.ts";
import type { AlteracoesUsuario, UsuarioRegistro } from "./tipos-usuarios.ts";

export type ResultadoCadastro =
  | { tipo: "criado"; usuario: UsuarioRegistro }
  | { tipo: "email_duplicado" };

export type ResultadoAtualizacao =
  | { tipo: "atualizado"; usuario: UsuarioRegistro }
  | { tipo: "nao_encontrado" }
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

export function obterUsuario(
  conexao: ConexaoBanco,
  id: number,
): UsuarioRegistro | null {
  return buscarUsuarioPorId(conexao, id);
}

export async function atualizarDadosUsuario(
  conexao: ConexaoBanco,
  id: number,
  dados: { nome?: string; email?: string; senha?: string },
): Promise<ResultadoAtualizacao> {
  if (
    dados.email !== undefined &&
    emailPertenceAOutroUsuario(conexao, dados.email, id)
  ) {
    return { tipo: "email_duplicado" };
  }

  const alteracoes: AlteracoesUsuario = {};
  if (dados.nome !== undefined) {
    alteracoes.nome = dados.nome;
  }
  if (dados.email !== undefined) {
    alteracoes.email = dados.email;
  }
  if (dados.senha !== undefined) {
    const { hash, salt } = await gerarHashSenha(dados.senha);
    alteracoes.senha = { hash, salt };
  }

  try {
    const usuario = atualizarUsuario(conexao, id, alteracoes);
    if (usuario === null) {
      return { tipo: "nao_encontrado" };
    }
    return { tipo: "atualizado", usuario };
  } catch (erro) {
    if (ehErroEmailDuplicado(erro)) {
      return { tipo: "email_duplicado" };
    }
    throw erro;
  }
}

export function excluirConta(conexao: ConexaoBanco, id: number): boolean {
  return excluirUsuario(conexao, id);
}
