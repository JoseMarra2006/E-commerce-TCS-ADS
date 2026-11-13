import {
  CAMINHO_SESSOES,
  CAMINHO_USUARIOS,
} from "../utilitarios/caminhos-api.ts";

const ORIGEM_BASE = "http://origem.invalid";

function extrairCaminho(endereco: string): string | null {
  let caminho: string;
  try {
    caminho = new URL(endereco, ORIGEM_BASE).pathname;
  } catch {
    return null;
  }

  return caminho.length > 1 && caminho.endsWith("/")
    ? caminho.slice(0, -1)
    : caminho;
}

function extrairSegmentoDoId(caminho: string, colecao: string): string | null {
  const inicio = `${colecao}/`;
  if (!caminho.startsWith(inicio)) {
    return null;
  }

  const segmento = caminho.slice(inicio.length);
  return segmento.length > 0 && !segmento.includes("/") ? segmento : null;
}

export function exigeAtualizacaoDeLogados(
  metodo: string,
  endereco: string,
  status: number,
): boolean {
  const caminho = extrairCaminho(endereco);
  if (caminho === null) {
    return false;
  }

  const metodoNormalizado = metodo.toUpperCase();

  if (caminho === CAMINHO_SESSOES) {
    return metodoNormalizado === "POST" && status === 201;
  }

  if (extrairSegmentoDoId(caminho, CAMINHO_SESSOES) !== null) {
    return metodoNormalizado === "DELETE" && status === 204;
  }

  if (extrairSegmentoDoId(caminho, CAMINHO_USUARIOS) === null) {
    return false;
  }

  if (metodoNormalizado === "DELETE") {
    return status === 204;
  }

  return (metodoNormalizado === "PUT" || metodoNormalizado === "PATCH") &&
    status === 200;
}
