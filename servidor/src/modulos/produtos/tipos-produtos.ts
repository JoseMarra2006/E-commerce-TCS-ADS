export interface ProdutoRegistro {
  id: number;
  nome: string;
  descricao: string;
  quantidade: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface DadosNovoProduto {
  nome: string;
  descricao: string;
  quantidade: number;
}

export interface AlteracoesProduto {
  nome?: string;
  descricao?: string;
  quantidade?: number;
}
