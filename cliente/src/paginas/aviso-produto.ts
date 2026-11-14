export const AVISO_PRODUTO_CRIADO = "Produto cadastrado com sucesso.";
export const AVISO_PRODUTO_ATUALIZADO = "Produto atualizado com sucesso.";
export const AVISO_PRODUTO_EXCLUIDO = "Produto excluído com sucesso.";
export const AVISO_PRODUTO_JA_EXCLUIDO = "O produto já havia sido excluído.";

export type CodigoAvisoProduto = "criado" | "atualizado" | "excluido" | "ja_excluido";

const CODIGOS_AVISO_PRODUTO: Record<CodigoAvisoProduto, string> = {
  criado: AVISO_PRODUTO_CRIADO,
  atualizado: AVISO_PRODUTO_ATUALIZADO,
  excluido: AVISO_PRODUTO_EXCLUIDO,
  ja_excluido: AVISO_PRODUTO_JA_EXCLUIDO,
};

export const AVISOS_DA_LISTA_DE_PRODUTOS: readonly CodigoAvisoProduto[] = [
  "criado",
  "excluido",
  "ja_excluido",
];
export const AVISOS_DO_DETALHE_DE_PRODUTO: readonly CodigoAvisoProduto[] = ["atualizado"];

export interface EstadoAvisoProduto {
  avisoProduto: CodigoAvisoProduto;
}

export function criarEstadoAvisoProduto(codigo: CodigoAvisoProduto): EstadoAvisoProduto {
  return { avisoProduto: codigo };
}

function ehCodigoAvisoProduto(valor: string): valor is CodigoAvisoProduto {
  return Object.hasOwn(CODIGOS_AVISO_PRODUTO, valor);
}

export function lerAvisoProduto(
  estado: unknown,
  permitidos: readonly CodigoAvisoProduto[] = Object.keys(CODIGOS_AVISO_PRODUTO).filter(
    ehCodigoAvisoProduto,
  ),
): string | null {
  if (typeof estado !== "object" || estado === null || Array.isArray(estado)) {
    return null;
  }
  if (!("avisoProduto" in estado) || typeof estado.avisoProduto !== "string") {
    return null;
  }
  const codigo = estado.avisoProduto;
  if (!ehCodigoAvisoProduto(codigo) || !permitidos.includes(codigo)) {
    return null;
  }
  return CODIGOS_AVISO_PRODUTO[codigo];
}
