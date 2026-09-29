import { compararEmTempoConstante } from "./comparacao-segura.ts";
import { bytesParaHexadecimal, hexadecimalParaBytes } from "./hexadecimal.ts";

export const ITERACOES_PBKDF2 = 600_000;
export const TAMANHO_SALT_BYTES = 16;
export const TAMANHO_HASH_BYTES = 32;

export async function derivarChavePbkdf2(
  senha: string,
  salt: Uint8Array<ArrayBuffer>,
  iteracoes: number,
  tamanhoBytes: number,
): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iteracoes },
    chave,
    tamanhoBytes * 8,
  );
  return new Uint8Array(bits);
}

export async function gerarHashSenha(
  senha: string,
): Promise<{ hash: string; salt: string }> {
  const salt = new Uint8Array(TAMANHO_SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await derivarChavePbkdf2(
    senha,
    salt,
    ITERACOES_PBKDF2,
    TAMANHO_HASH_BYTES,
  );
  return { hash: bytesParaHexadecimal(hash), salt: bytesParaHexadecimal(salt) };
}

export async function executarDerivacaoFicticia(senha: string): Promise<void> {
  try {
    await derivarChavePbkdf2(
      senha,
      new Uint8Array(TAMANHO_SALT_BYTES),
      ITERACOES_PBKDF2,
      TAMANHO_HASH_BYTES,
    );
  } catch {
    return;
  }
}

export async function verificarSenha(
  senha: string,
  hashHexadecimal: string,
  saltHexadecimal: string,
): Promise<boolean> {
  try {
    const hashEsperado = hexadecimalParaBytes(hashHexadecimal);
    const saltConvertido = hexadecimalParaBytes(saltHexadecimal);
    if (
      hashEsperado === null ||
      saltConvertido === null ||
      hashEsperado.length !== TAMANHO_HASH_BYTES ||
      saltConvertido.length !== TAMANHO_SALT_BYTES
    ) {
      await executarDerivacaoFicticia(senha);
      return false;
    }
    const salt = new Uint8Array(TAMANHO_SALT_BYTES);
    salt.set(saltConvertido);
    const hashCalculado = await derivarChavePbkdf2(
      senha,
      salt,
      ITERACOES_PBKDF2,
      TAMANHO_HASH_BYTES,
    );
    return compararEmTempoConstante(hashCalculado, hashEsperado);
  } catch {
    return false;
  }
}
