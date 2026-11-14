export interface RespostaUsuario {
  id: number;
  nome: string;
  email: string;
  admin: boolean;
}

export interface RespostaProduto {
  id: number;
  nome: string;
  descricao: string;
  quantidade: number;
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

export interface DadosProduto {
  nome: string;
  descricao: string;
  quantidade: number;
}

export interface CorpoAtualizacaoParcial {
  nome?: string;
  email?: string;
  senha?: string;
}
