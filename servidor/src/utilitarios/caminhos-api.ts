export const PREFIXO_API = "/api/v1";
export const CAMINHO_USUARIOS = "/api/v1/users";
export const CAMINHO_USUARIO = "/api/v1/users/:id";
export const CAMINHO_SESSOES = "/api/v1/sessions";
export const CAMINHO_SESSAO = "/api/v1/sessions/:id";
export const CAMINHO_PRODUTOS = "/api/v1/products";
export const CAMINHO_PRODUTO = "/api/v1/products/:id";

export function montarCaminhoUsuario(id: number): string {
  return `${PREFIXO_API}/users/${id}`;
}

export function montarCaminhoSessao(id: string): string {
  return `${PREFIXO_API}/sessions/${encodeURIComponent(id)}`;
}

export function montarCaminhoProduto(id: number): string {
  return `${PREFIXO_API}/products/${id}`;
}
