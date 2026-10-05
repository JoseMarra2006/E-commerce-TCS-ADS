const TAMANHO_MAXIMO_REGISTRO = 5000;
const SUFIXO_TRUNCADO = " (truncado)";
const TAMANHO_PREFIXO_TOKEN = 8;
const PADRAO_CAMPO_SENSIVEL = /"(senha|token)"\s*:\s*"(?:[^"\\]|\\.)*"/g;

function mascararCampo(chave: string, valor: unknown): unknown {
  if (chave === "senha") {
    return "***";
  }
  if (chave === "token") {
    return typeof valor === "string" ? `${valor.slice(0, TAMANHO_PREFIXO_TOKEN)}...` : "***";
  }
  return mascararValor(valor);
}

function mascararValor(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => mascararValor(item));
  }
  if (typeof valor === "object" && valor !== null) {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, conteudo]) => [chave, mascararCampo(chave, conteudo)]),
    );
  }
  return valor;
}

function truncar(texto: string): string {
  if (texto.length <= TAMANHO_MAXIMO_REGISTRO) {
    return texto;
  }
  return texto.slice(0, TAMANHO_MAXIMO_REGISTRO) + SUFIXO_TRUNCADO;
}

function mascararEstruturado(texto: string): string | null {
  try {
    return truncar(JSON.stringify(mascararValor(JSON.parse(texto))));
  } catch {
    return null;
  }
}

function mascararPorTexto(texto: string): string | null {
  try {
    const mascarado = texto.replace(PADRAO_CAMPO_SENSIVEL, (correspondencia) => {
      const nomeCampo = correspondencia.slice(0, correspondencia.indexOf(":")).trim();
      return `${nomeCampo}: "***"`;
    });
    return truncar(mascarado);
  } catch {
    return null;
  }
}

export function mascararParaRegistro(texto: string | null): string | null {
  if (texto === null || texto.trim().length === 0) {
    return null;
  }
  return mascararEstruturado(texto) ?? mascararPorTexto(texto);
}
