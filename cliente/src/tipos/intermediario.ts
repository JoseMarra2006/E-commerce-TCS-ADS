export interface PedidoEnvio {
  ip: string;
  porta: number;
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  caminho: string;
  token: string | null;
  corpo: string | null;
}

export type ErroRede =
  | "conexao_recusada"
  | "tempo_esgotado"
  | "endereco_nao_encontrado"
  | "resposta_muito_grande"
  | "falha_rede";

export type ResultadoEnvio =
  | {
    tipo: "resposta";
    url: string;
    status: number;
    cabecalhos: Record<string, string>;
    corpo: string;
    duracaoMs: number;
  }
  | { tipo: "erro_rede"; url: string; erro: ErroRede; duracaoMs: number };
