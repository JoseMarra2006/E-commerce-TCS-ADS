import type { RespostaProduto, RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";

const PADRAO_DIGITOS = /^[0-9]+$/;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerTextoNaoVazio(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function lerTexto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function lerIdInteiroPositivo(valor: unknown): number | null {
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

function lerAdmin(valor: unknown): boolean {
  return valor === true;
}

function lerQuantidade(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
}

function lerLista<T>(valor: unknown, lerItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(valor)) {
    return null;
  }
  const itens: T[] = [];
  for (const item of valor) {
    const lido = lerItem(item);
    if (lido === null) {
      return null;
    }
    itens.push(lido);
  }
  return itens;
}

export function lerRespostaUsuario(valor: unknown): RespostaUsuario | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const id = lerIdInteiroPositivo(valor.id);
  const nome = lerTextoNaoVazio(valor.nome);
  const email = lerTextoNaoVazio(valor.email);
  if (id === null || nome === null || email === null) {
    return null;
  }
  return { id, nome, email, admin: lerAdmin(valor.admin) };
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

export function lerRespostaProduto(valor: unknown): RespostaProduto | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const id = lerIdInteiroPositivo(valor.id);
  const nome = lerTextoNaoVazio(valor.nome);
  const descricao = lerTexto(valor.descricao);
  const quantidade = lerQuantidade(valor.quantidade);
  if (id === null || nome === null || descricao === null || quantidade === null) {
    return null;
  }
  return { id, nome, descricao, quantidade };
}

export function lerListaUsuarios(valor: unknown): RespostaUsuario[] | null {
  return lerLista(valor, lerRespostaUsuario);
}

export function lerListaProdutos(valor: unknown): RespostaProduto[] | null {
  return lerLista(valor, lerRespostaProduto);
}
