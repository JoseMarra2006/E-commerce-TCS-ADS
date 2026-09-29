import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export function criarCaminhoBancoTemporario(): string {
  return fileURLToPath(
    new URL(`../../dados/teste-${crypto.randomUUID()}.db`, import.meta.url),
  );
}

export function removerBancoTemporario(caminhoBanco: string): void {
  if (!basename(caminhoBanco).startsWith("teste-")) {
    throw new Error(
      "Recusado: o caminho informado não é um banco temporário de teste.",
    );
  }
  for (
    const caminho of [
      caminhoBanco,
      `${caminhoBanco}-wal`,
      `${caminhoBanco}-shm`,
    ]
  ) {
    try {
      Deno.removeSync(caminho);
    } catch (erro) {
      if (!(erro instanceof Deno.errors.NotFound)) {
        throw erro;
      }
    }
  }
}
