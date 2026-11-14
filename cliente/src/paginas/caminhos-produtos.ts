export const CAMINHO_LISTA_PRODUTOS = "/produtos";

export function caminhoDetalheProduto(id: number): string {
  return `${CAMINHO_LISTA_PRODUTOS}/${String(id)}`;
}
