import { fileURLToPath } from "node:url";

export function criarCaminhoBancoTemporario(): string {
  return fileURLToPath(
    new URL(`../../dados/teste-${crypto.randomUUID()}.db`, import.meta.url),
  );
}

export function removerBancoTemporario(caminhoBanco: string): void {
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
