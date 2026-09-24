export type ResultadoValidacaoPorta =
  | { ok: true; porta: number }
  | { ok: false; mensagem: string };

const PADRAO_APENAS_NUMEROS = /^[0-9]+$/;

export function validarPorta(texto: string): ResultadoValidacaoPorta {
  const textoLimpo = texto.trim();

  if (textoLimpo.length === 0) {
    return { ok: false, mensagem: "Informe a porta." };
  }

  if (!PADRAO_APENAS_NUMEROS.test(textoLimpo)) {
    return { ok: false, mensagem: "A porta deve conter apenas números." };
  }

  const porta = Number(textoLimpo);

  if (porta < 1 || porta > 65535) {
    return { ok: false, mensagem: "A porta deve estar entre 1 e 65535." };
  }

  return { ok: true, porta };
}
