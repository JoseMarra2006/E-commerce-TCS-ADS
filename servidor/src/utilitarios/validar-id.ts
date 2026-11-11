const PADRAO_ID_NUMERICO = /^[0-9]+$/;

export function interpretarIdInteiroPositivo(
  texto: string,
): number | undefined {
  if (!PADRAO_ID_NUMERICO.test(texto)) {
    return undefined;
  }

  const valorNumerico = Number(texto);

  if (!Number.isSafeInteger(valorNumerico) || valorNumerico <= 0) {
    return undefined;
  }

  return valorNumerico;
}
