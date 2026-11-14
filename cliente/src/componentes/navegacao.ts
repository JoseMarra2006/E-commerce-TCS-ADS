import { ehAdministrador } from "../contextos/eh-administrador.ts";

export interface LinkNavegacao {
  para: string;
  texto: string;
}

export function deveMostrarLinkUsuarios(usuario: object | null | undefined): boolean {
  return ehAdministrador(usuario);
}

export function deveMostrarLinkProdutos(usuario: object | null | undefined): boolean {
  return usuario !== null && usuario !== undefined;
}

export function montarLinksNavegacao(usuario: object | null | undefined): LinkNavegacao[] {
  const links: LinkNavegacao[] = [];
  if (deveMostrarLinkProdutos(usuario)) {
    links.push({ para: "/produtos", texto: "Produtos" });
  }
  if (deveMostrarLinkUsuarios(usuario)) {
    links.push({ para: "/usuarios", texto: "Usuários" });
  }
  return links;
}
