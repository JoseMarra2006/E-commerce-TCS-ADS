const TAMANHO_MAXIMO_REGISTRO = 5000;
const SUFIXO_TRUNCADO = " (truncado)";
const TAMANHO_PREFIXO_TOKEN = 8;

const PADRAO_CAMPO_SENSIVEL = /"(senha|token)"\s*:\s*"(?:[^"\\]|\\.)*"/g;

function mascararValorRecursivo(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => mascararValorRecursivo(item));
  }

  if (typeof valor === "object" && valor !== null) {
    const objetoOriginal = valor as Record<string, unknown>;
    const objetoMascarado: Record<string, unknown> = {};

    for (const chave of Object.keys(objetoOriginal)) {
      const valorCampo = objetoOriginal[chave];

      if (chave === "senha") {
        objetoMascarado[chave] = "***";
      } else if (chave === "token") {
        if (typeof valorCampo === "string") {
          objetoMascarado[chave] = `${
            valorCampo.slice(0, TAMANHO_PREFIXO_TOKEN)
          }...`;
        } else {
          objetoMascarado[chave] = "***";
        }
      } else {
        objetoMascarado[chave] = mascararValorRecursivo(valorCampo);
      }
    }

    return objetoMascarado;
  }

  return valor;
}

function truncarSeNecessario(texto: string): string {
  if (texto.length <= TAMANHO_MAXIMO_REGISTRO) {
    return texto;
  }

  return texto.slice(0, TAMANHO_MAXIMO_REGISTRO) + SUFIXO_TRUNCADO;
}

export function mascararCorpoParaRegistro(
  texto: string | null,
): string | null {
  if (texto === null || texto.trim().length === 0) {
    return null;
  }

  let valorAnalisado: unknown;
  let ehJsonValido = true;

  try {
    valorAnalisado = JSON.parse(texto);
  } catch {
    ehJsonValido = false;
  }

  if (ehJsonValido) {
    try {
      const valorMascarado = mascararValorRecursivo(valorAnalisado);
      return truncarSeNecessario(JSON.stringify(valorMascarado));
    } catch (erro) {
      if (!(erro instanceof RangeError)) {
        throw erro;
      }
    }
  }

  const textoMascarado = texto.replace(
    PADRAO_CAMPO_SENSIVEL,
    (correspondencia) => {
      const nomeCampo = correspondencia.slice(0, correspondencia.indexOf(":"))
        .trim();
      return `${nomeCampo}: "***"`;
    },
  );

  return truncarSeNecessario(textoMascarado);
}
