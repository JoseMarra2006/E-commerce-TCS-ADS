import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type ConexaoBanco = DatabaseSync;

export function obterCaminhoBanco(): string {
  return fileURLToPath(new URL("../../dados/ecommerce.db", import.meta.url));
}

export function garantirPastaDoBanco(caminhoBanco: string): void {
  Deno.mkdirSync(dirname(caminhoBanco), { recursive: true });
}

export function abrirConexao(caminhoBanco: string): ConexaoBanco {
  let conexao: ConexaoBanco | undefined;
  try {
    conexao = new DatabaseSync(caminhoBanco);
    conexao.exec("PRAGMA journal_mode = WAL;");
    conexao.exec("PRAGMA foreign_keys = ON;");
    conexao.exec("PRAGMA busy_timeout = 5000;");
    const linha = conexao.prepare("PRAGMA journal_mode;").get() as
      | { journal_mode: string }
      | undefined;
    if (linha?.journal_mode !== "wal") {
      throw new Error("Não foi possível ativar o modo WAL no banco de dados.");
    }
    return conexao;
  } catch (erro) {
    if (conexao !== undefined) {
      fecharConexao(conexao);
    }
    if (
      erro instanceof Error &&
      erro.message === "Não foi possível ativar o modo WAL no banco de dados."
    ) {
      throw erro;
    }
    const mensagemOriginal = erro instanceof Error
      ? erro.message
      : String(erro);
    throw new Error(
      `Não foi possível abrir o banco de dados: ${mensagemOriginal}.`,
      { cause: erro },
    );
  }
}

export function fecharConexao(conexao: ConexaoBanco): void {
  try {
    conexao.close();
  } catch {
    return;
  }
}
