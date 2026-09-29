export function compararEmTempoConstante(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a[i] ^ b[i];
  }
  return diferenca === 0;
}
