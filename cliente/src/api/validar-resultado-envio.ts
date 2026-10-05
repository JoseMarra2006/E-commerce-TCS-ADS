import type { ErroRede, ResultadoEnvio } from "../tipos/intermediario.ts";

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerCabecalhos(valor: unknown): Record<string, string> | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const cabecalhos: Record<string, string> = {};
  for (const [nome, conteudo] of Object.entries(valor)) {
    if (typeof conteudo !== "string") {
      return null;
    }
    cabecalhos[nome] = conteudo;
  }
  return cabecalhos;
}

function lerErroRede(valor: unknown): ErroRede | null {
  if (typeof valor !== "string") {
    return null;
  }
  switch (valor) {
    case "conexao_recusada":
    case "tempo_esgotado":
    case "endereco_nao_encontrado":
    case "resposta_muito_grande":
    case "falha_rede":
      return valor;
    default:
      return null;
  }
}

export function lerResultadoEnvio(valor: unknown): ResultadoEnvio | null {
  if (!ehObjeto(valor)) {
    return null;
  }
  const { tipo, url, duracaoMs } = valor;
  if (typeof url !== "string" || typeof duracaoMs !== "number" || !Number.isFinite(duracaoMs)) {
    return null;
  }

  if (tipo === "erro_rede") {
    const erro = lerErroRede(valor.erro);
    return erro === null ? null : { tipo: "erro_rede", url, erro, duracaoMs };
  }

  if (tipo === "resposta") {
    const { status, corpo } = valor;
    const cabecalhos = lerCabecalhos(valor.cabecalhos);
    if (
      typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599 ||
      typeof corpo !== "string" || cabecalhos === null
    ) {
      return null;
    }
    return { tipo: "resposta", url, status, cabecalhos, corpo, duracaoMs };
  }

  return null;
}
