import { ehAdministrador } from "../contextos/eh-administrador.ts";

export interface LinkNavegacao {
  para: string;
  texto: string;
}

export function deveMostrarLinkUsuarios(usuario: object | null | undefined): boolean {
  return ehAdministrador(usuario);
}

export function montarLinksNavegacao(usuario: object | null | undefined): LinkNavegacao[] {
  const links: LinkNavegacao[] = [];
  if (deveMostrarLinkUsuarios(usuario)) {
    links.push({ para: "/usuarios", texto: "Usuários" });
  }
  return links;
}
