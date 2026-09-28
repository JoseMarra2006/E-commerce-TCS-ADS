import type { ConexaoBanco } from "./conexao.ts";
import { classificarErroBanco } from "./erros.ts";

export type SemPromessa<T> = T extends PromiseLike<unknown> ? never : T;

const conexoesEmTransacao = new WeakSet<ConexaoBanco>();

const MAXIMO_TENTATIVAS = 4;

function executarRollbackSilencioso(conexao: ConexaoBanco): void {
  try {
    conexao.exec("ROLLBACK;");
  } catch {
    return;
  }
}

function ehResultadoAssincrono(resultado: unknown): boolean {
  return (
    resultado !== null &&
    typeof resultado === "object" &&
    typeof (resultado as { then?: unknown }).then === "function"
  );
}

export function executarTransacao<T>(
  conexao: ConexaoBanco,
  operacao: () => SemPromessa<T>,
): SemPromessa<T> {
  if (conexoesEmTransacao.has(conexao)) {
    throw new Error("Transações aninhadas não são permitidas.");
  }

  conexoesEmTransacao.add(conexao);
  try {
    for (let tentativa = 0; tentativa < MAXIMO_TENTATIVAS; tentativa++) {
      const ultimaTentativa = tentativa === MAXIMO_TENTATIVAS - 1;

      try {
        conexao.exec("BEGIN IMMEDIATE;");
      } catch (erro) {
        if (classificarErroBanco(erro).tipo === "ocupado" && !ultimaTentativa) {
          continue;
        }
        throw erro;
      }

      try {
        const resultado = operacao();
        if (ehResultadoAssincrono(resultado)) {
          executarRollbackSilencioso(conexao);
          throw new Error(
            "A operação de uma transação não pode ser assíncrona.",
          );
        }
        conexao.exec("COMMIT;");
        return resultado;
      } catch (erro) {
        executarRollbackSilencioso(conexao);
        if (classificarErroBanco(erro).tipo === "ocupado" && !ultimaTentativa) {
          continue;
        }
        throw erro;
      }
    }
    throw new Error("Não foi possível concluir a transação.");
  } finally {
    conexoesEmTransacao.delete(conexao);
  }
}
