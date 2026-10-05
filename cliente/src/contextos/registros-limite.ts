import type { RegistroMensagem } from "../api/cliente-http.ts";

export const LIMITE_REGISTROS = 200;

export function incluirRegistroComLimite(
  lista: readonly RegistroMensagem[],
  registro: RegistroMensagem,
  limite: number,
): RegistroMensagem[] {
  if (limite <= 0) {
    return [];
  }
  const nova = [...lista, registro];
  return nova.length > limite ? nova.slice(nova.length - limite) : nova;
}
