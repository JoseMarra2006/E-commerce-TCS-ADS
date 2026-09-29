import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export const SEGREDO_TESTE = "a1b2c3d4".repeat(16);

export function criarCaminhoSegredoTemporario(): string {
  return fileURLToPath(
    new URL(
      `../../dados/teste-segredo-${crypto.randomUUID()}.txt`,
      import.meta.url,
    ),
  );
}

export function removerSegredoTemporario(caminhoSegredo: string): void {
  if (!basename(caminhoSegredo).startsWith("teste-")) {
    throw new Error(
      "Recusado: o caminho informado não é um segredo temporário de teste.",
    );
  }
  for (const caminho of [caminhoSegredo, `${caminhoSegredo}.tmp`]) {
    try {
      Deno.removeSync(caminho);
    } catch (erro) {
      if (!(erro instanceof Deno.errors.NotFound)) {
        throw erro;
      }
    }
  }
}
