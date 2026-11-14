export const AVISO_PRODUTO_CRIADO = "Produto cadastrado com sucesso.";

export type CodigoAvisoProduto = "criado";

const CODIGOS_AVISO_PRODUTO: Record<CodigoAvisoProduto, string> = {
  criado: AVISO_PRODUTO_CRIADO,
};

export interface EstadoAvisoProduto {
  avisoProduto: CodigoAvisoProduto;
}

export function criarEstadoAvisoProduto(codigo: CodigoAvisoProduto): EstadoAvisoProduto {
  return { avisoProduto: codigo };
}

function ehCodigoAvisoProduto(valor: string): valor is CodigoAvisoProduto {
  return Object.hasOwn(CODIGOS_AVISO_PRODUTO, valor);
}

export function lerAvisoProduto(estado: unknown): string | null {
  if (typeof estado !== "object" || estado === null || Array.isArray(estado)) {
    return null;
  }
  if (!("avisoProduto" in estado) || typeof estado.avisoProduto !== "string") {
    return null;
  }
  return ehCodigoAvisoProduto(estado.avisoProduto)
    ? CODIGOS_AVISO_PRODUTO[estado.avisoProduto]
    : null;
}
