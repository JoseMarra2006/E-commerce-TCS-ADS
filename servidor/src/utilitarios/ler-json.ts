export type ResultadoLeituraCorpoJson =
  | { ok: true; dados: Record<string, unknown> }
  | { ok: false; mensagem: string };

export type ResultadoLeituraCampoTexto =
  | { ok: true; presente: false }
  | { ok: true; presente: true; valor: string }
  | { ok: false; mensagem: string };

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function lerCorpoJson(texto: string): ResultadoLeituraCorpoJson {
  if (texto.trim().length === 0) {
    return { ok: false, mensagem: "O corpo da requisição é obrigatório." };
  }

  let valor: unknown;

  try {
    valor = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      mensagem: "O corpo da requisição não é um JSON válido.",
    };
  }

  if (!ehObjetoSimples(valor)) {
    return {
      ok: false,
      mensagem: "O corpo da requisição deve ser um objeto JSON.",
    };
  }

  return { ok: true, dados: valor };
}

export function lerCampoTexto(
  dados: Record<string, unknown>,
  campo: string,
  obrigatorio: boolean,
): ResultadoLeituraCampoTexto {
  const presente = Object.prototype.hasOwnProperty.call(dados, campo);

  if (!presente) {
    if (obrigatorio) {
      return { ok: false, mensagem: `O campo ${campo} é obrigatório.` };
    }
    return { ok: true, presente: false };
  }

  const valor = dados[campo];

  if (valor === null) {
    return { ok: false, mensagem: `O campo ${campo} não pode ser nulo.` };
  }

  if (typeof valor !== "string") {
    return { ok: false, mensagem: `O campo ${campo} deve ser um texto.` };
  }

  return { ok: true, presente: true, valor };
}
