import type { RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";

const PADRAO_DIGITOS = /^[0-9]+$/;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerTextoNaoVazio(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function lerIdUsuario(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor === "string" && PADRAO_DIGITOS.test(valor)) {
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  }
  return null;
}

function lerIdSessao(valor: unknown): string | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? String(valor) : null;
  }
  return lerTextoNaoVazio(valor);
}

export function lerRespostaUsuario(valor: unknown): RespostaUsuario | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const id = lerIdUsuario(valor.id);
  const nome = lerTextoNaoVazio(valor.nome);
  const email = lerTextoNaoVazio(valor.email);
  if (id === null || nome === null || email === null) {
    return null;
  }
  return { id, nome, email };
}

export function lerRespostaSessao(valor: unknown): RespostaSessao | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const id = lerIdSessao(valor.id);
  const token = lerTextoNaoVazio(valor.token);
  const usuario = lerRespostaUsuario(valor.usuario);
  if (id === null || token === null || usuario === null) {
    return null;
  }
  return { id, token, usuario };
}
