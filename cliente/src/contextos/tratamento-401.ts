import type { Operacoes, ResultadoOperacao } from "../api/operacoes.ts";
import type { AvisoSessao } from "./contexto-sessao.ts";

export const AVISO_SESSAO_ENCERRADA: AvisoSessao = {
  tipo: "aviso",
  texto: "Sua sessão foi encerrada. Faça login novamente.",
};

export function envolverOperacoesComTratamento401(
  operacoes: Operacoes,
  aoNaoAutorizado: () => void,
): Operacoes {
  async function tratar<T>(execucao: Promise<ResultadoOperacao<T>>): Promise<ResultadoOperacao<T>> {
    const resultado = await execucao;
    if (!resultado.ok && resultado.tipo === "http" && resultado.status === 401) {
      aoNaoAutorizado();
    }
    return resultado;
  }

  return {
    ...operacoes,
    lerCadastro: (idUsuario, token) => tratar(operacoes.lerCadastro(idUsuario, token)),
    atualizarCadastro: (idUsuario, token, alteracoes) =>
      tratar(operacoes.atualizarCadastro(idUsuario, token, alteracoes)),
    excluirCadastro: (idUsuario, token) => tratar(operacoes.excluirCadastro(idUsuario, token)),
  };
}
