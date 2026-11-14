const PADRAO_DIGITOS_ASCII = /^[0-9]+$/;

export function interpretarIdRota(texto: string | undefined): number | null {
  if (texto === undefined || !PADRAO_DIGITOS_ASCII.test(texto)) {
    return null;
  }
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}
