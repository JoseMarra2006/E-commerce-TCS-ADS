export const CAMINHO_LISTA_USUARIOS = "/usuarios";

export function caminhoDetalheUsuario(id: number): string {
  return `${CAMINHO_LISTA_USUARIOS}/${String(id)}`;
}
