const PADRAO_HEXADECIMAL = /^[0-9a-fA-F]*$/;

export function bytesParaHexadecimal(bytes: Uint8Array): string {
  let texto = "";
  for (const byte of bytes) {
    texto += byte.toString(16).padStart(2, "0");
  }
  return texto;
}

export function hexadecimalParaBytes(texto: string): Uint8Array | null {
  if (texto.length % 2 !== 0 || !PADRAO_HEXADECIMAL.test(texto)) {
    return null;
  }
  const bytes = new Uint8Array(texto.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(texto.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
