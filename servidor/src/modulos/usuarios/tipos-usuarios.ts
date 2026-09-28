export type PapelUsuario = "comum" | "administrador";

export interface UsuarioRegistro {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  senhaSalt: string;
  papel: PapelUsuario;
  criadoEm: string;
  atualizadoEm: string;
}

export interface DadosNovoUsuario {
  nome: string;
  email: string;
  senhaHash: string;
  senhaSalt: string;
}

export interface AlteracoesUsuario {
  nome?: string;
  email?: string;
  senha?: { hash: string; salt: string };
}
