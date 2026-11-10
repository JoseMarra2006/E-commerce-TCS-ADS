import type { ConexaoBanco } from "../../banco/conexao.ts";
import { ehErroEmailDuplicado } from "../../banco/erros.ts";
import { executarTransacao } from "../../banco/transacao.ts";
import { gerarHashSenha } from "../../utilitarios/senha.ts";
import { buscarUsuarioPorEmail, criarUsuario } from "./repositorio-usuarios.ts";
import type { PapelUsuario } from "./tipos-usuarios.ts";

export const NOME_ADM_PADRAO = "Admin";
export const EMAIL_ADM_PADRAO = "adm@teste.com";
export const SENHA_ADM_PADRAO = "admin123";
export const PAPEL_ADM_PADRAO: PapelUsuario = "administrador";

export const MENSAGEM_ADM_PADRAO_EXISTENTE =
  `Aviso: o e-mail do ADM padrão (${EMAIL_ADM_PADRAO}) já está cadastrado. Nada foi alterado.`;
export const MENSAGEM_ADM_PADRAO_CRIADO =
  `ADM padrão criado (${EMAIL_ADM_PADRAO}).`;

export type RegistradorSistema = (
  nivel: "info" | "erro",
  mensagem: string,
) => void;

export type ResultadoAdmPadrao = "criado" | "existente";

function inserirAdmPadrao(
  conexao: ConexaoBanco,
  senhaHash: string,
  senhaSalt: string,
): boolean {
  try {
    return executarTransacao(conexao, () => {
      if (buscarUsuarioPorEmail(conexao, EMAIL_ADM_PADRAO) !== null) {
        return false;
      }
      criarUsuario(conexao, {
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        senhaHash,
        senhaSalt,
        papel: PAPEL_ADM_PADRAO,
      });
      return true;
    });
  } catch (erro) {
    if (ehErroEmailDuplicado(erro)) {
      return false;
    }
    throw erro;
  }
}

export async function garantirAdmPadrao(
  conexao: ConexaoBanco,
  registrar: RegistradorSistema,
): Promise<ResultadoAdmPadrao> {
  if (buscarUsuarioPorEmail(conexao, EMAIL_ADM_PADRAO) !== null) {
    registrar("info", MENSAGEM_ADM_PADRAO_EXISTENTE);
    return "existente";
  }

  const { hash, salt } = await gerarHashSenha(SENHA_ADM_PADRAO);

  if (!inserirAdmPadrao(conexao, hash, salt)) {
    registrar("info", MENSAGEM_ADM_PADRAO_EXISTENTE);
    return "existente";
  }

  registrar("info", MENSAGEM_ADM_PADRAO_CRIADO);
  return "criado";
}
