import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bytesParaHexadecimal, hexadecimalParaBytes } from "./hexadecimal.ts";

const TAMANHO_SEGREDO_BYTES = 64;

export type SituacaoSegredoJwt = "carregado" | "gerado" | "substituido";

export interface ResultadoSegredoJwt {
  segredo: string;
  situacao: SituacaoSegredoJwt;
}

export function obterCaminhoSegredoJwt(): string {
  return fileURLToPath(
    new URL("../../dados/segredo-jwt.txt", import.meta.url),
  );
}

function segredoEhValido(texto: string): boolean {
  const bytes = hexadecimalParaBytes(texto);
  return bytes !== null && bytes.length === TAMANHO_SEGREDO_BYTES;
}

function removerArquivoTemporario(caminho: string): void {
  try {
    Deno.removeSync(caminho);
  } catch {
    return;
  }
}

function gravarSegredoDeFormaAtomica(caminho: string, segredo: string): void {
  const caminhoTemporario = `${caminho}.tmp`;
  try {
    Deno.writeTextFileSync(caminhoTemporario, segredo);
    Deno.renameSync(caminhoTemporario, caminho);
  } catch (erro) {
    removerArquivoTemporario(caminhoTemporario);
    throw erro;
  }
}

function gerarNovoSegredo(caminho: string): string {
  const bytes = new Uint8Array(TAMANHO_SEGREDO_BYTES);
  crypto.getRandomValues(bytes);
  const segredo = bytesParaHexadecimal(bytes);
  gravarSegredoDeFormaAtomica(caminho, segredo);
  return segredo;
}

function lerConteudo(caminho: string): string | null {
  try {
    return Deno.readTextFileSync(caminho);
  } catch (erro) {
    if (erro instanceof Deno.errors.NotFound) {
      return null;
    }
    throw erro;
  }
}

export function carregarOuGerarSegredoJwt(
  caminho: string,
): ResultadoSegredoJwt {
  Deno.mkdirSync(dirname(caminho), { recursive: true });

  const conteudo = lerConteudo(caminho);
  if (conteudo === null) {
    return { segredo: gerarNovoSegredo(caminho), situacao: "gerado" };
  }

  const texto = conteudo.trim();
  if (segredoEhValido(texto)) {
    return { segredo: texto.toLowerCase(), situacao: "carregado" };
  }

  return { segredo: gerarNovoSegredo(caminho), situacao: "substituido" };
}
