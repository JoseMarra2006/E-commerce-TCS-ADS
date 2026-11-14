export function ehAdministrador(usuario: object | null | undefined): boolean {
  return usuario !== null && usuario !== undefined && "admin" in usuario && usuario.admin === true;
}
