export type StatusServidor =
  | "parada"
  | "iniciando"
  | "em_execucao"
  | "parando"
  | "erro";

export interface EstadoThreadServidor {
  numero: number;
  pronta: boolean;
  emAndamento: number;
}

export interface EstadoServidor {
  status: StatusServidor;
  porta: number | null;
  mensagemErro: string | null;
  enderecos: string[];
  threads: EstadoThreadServidor[];
}

export type Registro =
  | {
    tipo: "requisicao";
    horario: string;
    thread: number | null;
    metodo: string;
    caminho: string;
    status: number;
    duracaoMs: number;
    ipOrigem: string;
    corpoRecebido: string | null;
    corpoEnviado: string | null;
  }
  | {
    tipo: "sistema";
    horario: string;
    nivel: "info" | "erro";
    mensagem: string;
  };
