import type { ConexaoBanco } from "../../banco/conexao.ts";
import { classificarErroBanco } from "../../banco/erros.ts";
import { gerarTokenJwt } from "../../utilitarios/jwt.ts";
import {
  executarDerivacaoFicticia,
  verificarSenha,
} from "../../utilitarios/senha.ts";
import { buscarUsuarioPorEmail } from "../usuarios/repositorio-usuarios.ts";
import type { UsuarioRegistro } from "../usuarios/tipos-usuarios.ts";
import { criarSessao, excluirSessao } from "./repositorio-sessoes.ts";
import type { SessaoRegistro } from "./tipos-sessoes.ts";

export type ResultadoLogin =
  | {
    tipo: "autenticado";
    sessao: SessaoRegistro;
    token: string;
    usuario: UsuarioRegistro;
  }
  | { tipo: "credenciais_invalidas" };

export async function autenticarUsuario(
  conexao: ConexaoBanco,
  segredoJwt: string,
  dados: { email: string; senha: string },
): Promise<ResultadoLogin> {
  const usuario = buscarUsuarioPorEmail(conexao, dados.email);
  if (usuario === null) {
    await executarDerivacaoFicticia(dados.senha);
    return { tipo: "credenciais_invalidas" };
  }

  const senhaCorreta = await verificarSenha(
    dados.senha,
    usuario.senhaHash,
    usuario.senhaSalt,
  );
  if (!senhaCorreta) {
    return { tipo: "credenciais_invalidas" };
  }

  let sessao: SessaoRegistro;
  try {
    sessao = criarSessao(conexao, usuario.id);
  } catch (erro) {
    if (classificarErroBanco(erro).tipo === "chave_estrangeira") {
      return { tipo: "credenciais_invalidas" };
    }
    throw erro;
  }

  try {
    const token = await gerarTokenJwt(
      { usuarioId: usuario.id, sessaoId: sessao.id },
      segredoJwt,
    );
    return { tipo: "autenticado", sessao, token, usuario };
  } catch (erro) {
    excluirSessao(conexao, sessao.id);
    throw erro;
  }
}

export function encerrarSessao(
  conexao: ConexaoBanco,
  sessaoId: string,
): boolean {
  return excluirSessao(conexao, sessaoId);
}
