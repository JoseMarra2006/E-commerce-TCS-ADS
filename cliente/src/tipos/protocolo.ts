export interface RespostaUsuario {
  id: number;
  nome: string;
  email: string;
}

export interface RespostaSessao {
  id: string;
  token: string;
  usuario: RespostaUsuario;
}

export interface CorpoCadastro {
  nome: string;
  email: string;
  senha: string;
}

export interface CorpoLogin {
  email: string;
  senha: string;
}

export interface CorpoAtualizacaoParcial {
  nome?: string;
  email?: string;
  senha?: string;
}
