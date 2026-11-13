import { type ConexaoBanco, fecharConexao } from "../banco/conexao.ts";
import {
  abrirConexaoSomenteLeitura,
  consultarUsuariosLogados,
  type UsuarioLogado,
} from "./consulta-usuarios-logados.ts";

export type EstadoLogados = "disponivel" | "indisponivel";

export interface InstantaneoLogados {
  estado: EstadoLogados;
  usuarios: UsuarioLogado[];
  atualizadoEm: string | null;
}

export type NivelRegistroMonitor = "info" | "erro";

export interface OpcoesMonitorUsuariosLogados {
  caminhoBanco: string;
  abrirConexao?: (caminhoBanco: string) => ConexaoBanco;
  consultar?: (conexao: ConexaoBanco) => UsuarioLogado[];
  atrasoDebounceMs?: number;
  esperaMaximaMs?: number;
  intervaloReleituraMs?: number;
  registrar?: (nivel: NivelRegistroMonitor, mensagem: string) => void;
  aoMudar?: (instantaneo: InstantaneoLogados) => void;
}

const ATRASO_DEBOUNCE_PADRAO_MS = 100;
const ESPERA_MAXIMA_PADRAO_MS = 500;
const INTERVALO_RELEITURA_PADRAO_MS = 10000;

export function criarInstantaneoIndisponivel(): InstantaneoLogados {
  return { estado: "indisponivel", usuarios: [], atualizadoEm: null };
}

function copiarInstantaneo(
  instantaneo: InstantaneoLogados,
): InstantaneoLogados {
  return {
    estado: instantaneo.estado,
    usuarios: instantaneo.usuarios.map((usuario) => ({ ...usuario })),
    atualizadoEm: instantaneo.atualizadoEm,
  };
}

function assinar(estado: EstadoLogados, usuarios: UsuarioLogado[]): string {
  return JSON.stringify({ estado, usuarios });
}

export class MonitorUsuariosLogados {
  private readonly caminhoBanco: string;
  private readonly abrirConexao: (caminhoBanco: string) => ConexaoBanco;
  private readonly consultar: (conexao: ConexaoBanco) => UsuarioLogado[];
  private readonly atrasoDebounceMs: number;
  private readonly esperaMaximaMs: number;
  private readonly intervaloReleituraMs: number;
  private readonly registrar: (
    nivel: NivelRegistroMonitor,
    mensagem: string,
  ) => void;
  private readonly aoMudar: (instantaneo: InstantaneoLogados) => void;
  private conexao: ConexaoBanco | null = null;
  private ativo = false;
  private parado = false;
  private estadoAnterior: EstadoLogados | null = null;
  private instantaneo: InstantaneoLogados = criarInstantaneoIndisponivel();
  private assinatura = assinar("indisponivel", []);
  private temporizadorDebounce: ReturnType<typeof setTimeout> | undefined;
  private primeiroPedidoPendenteEm: number | null = null;
  private intervaloReleitura: ReturnType<typeof setInterval> | undefined;

  constructor(opcoes: OpcoesMonitorUsuariosLogados) {
    this.caminhoBanco = opcoes.caminhoBanco;
    this.abrirConexao = opcoes.abrirConexao ?? abrirConexaoSomenteLeitura;
    this.consultar = opcoes.consultar ?? consultarUsuariosLogados;
    this.atrasoDebounceMs = opcoes.atrasoDebounceMs ??
      ATRASO_DEBOUNCE_PADRAO_MS;
    this.esperaMaximaMs = opcoes.esperaMaximaMs ?? ESPERA_MAXIMA_PADRAO_MS;
    this.intervaloReleituraMs = opcoes.intervaloReleituraMs ??
      INTERVALO_RELEITURA_PADRAO_MS;
    this.registrar = opcoes.registrar ?? (() => {});
    this.aoMudar = opcoes.aoMudar ?? (() => {});
  }

  iniciar(): void {
    if (this.ativo || this.parado) {
      return;
    }

    this.ativo = true;
    this.atualizar();
    this.intervaloReleitura = setInterval(
      () => this.atualizar(),
      this.intervaloReleituraMs,
    );
  }

  solicitarAtualizacao(): void {
    try {
      if (!this.ativo) {
        return;
      }

      const agora = Date.now();
      if (this.primeiroPedidoPendenteEm === null) {
        this.primeiroPedidoPendenteEm = agora;
      }

      clearTimeout(this.temporizadorDebounce);
      const restanteEsperaMaxima = this.primeiroPedidoPendenteEm +
        this.esperaMaximaMs - agora;
      const atraso = Math.max(
        0,
        Math.min(this.atrasoDebounceMs, restanteEsperaMaxima),
      );
      this.temporizadorDebounce = setTimeout(
        () => this.executarLeituraAgendada(),
        atraso,
      );
    } catch {
      return;
    }
  }

  obterInstantaneo(): InstantaneoLogados {
    return copiarInstantaneo(this.instantaneo);
  }

  parar(): void {
    if (this.parado) {
      return;
    }

    this.parado = true;
    this.ativo = false;
    clearTimeout(this.temporizadorDebounce);
    this.temporizadorDebounce = undefined;
    this.primeiroPedidoPendenteEm = null;
    clearInterval(this.intervaloReleitura);
    this.intervaloReleitura = undefined;
    this.fecharConexaoAtual();
  }

  private executarLeituraAgendada(): void {
    this.temporizadorDebounce = undefined;
    this.primeiroPedidoPendenteEm = null;
    this.atualizar();
  }

  private atualizar(): void {
    try {
      if (!this.ativo) {
        return;
      }

      const usuarios = this.lerUsuarios();
      if (usuarios === null) {
        this.definirIndisponivel();
        return;
      }

      this.definirDisponivel(usuarios);
    } catch {
      return;
    }
  }

  private lerUsuarios(): UsuarioLogado[] | null {
    try {
      if (this.conexao === null) {
        this.conexao = this.abrirConexao(this.caminhoBanco);
      }
      return this.consultar(this.conexao);
    } catch {
      this.fecharConexaoAtual();
      return null;
    }
  }

  private definirDisponivel(usuarios: UsuarioLogado[]): void {
    const anterior = this.estadoAnterior;
    this.estadoAnterior = "disponivel";

    if (anterior === null) {
      this.registrarSemFalhar(
        "info",
        `Monitor de usuários logados iniciado com ${usuarios.length} ${
          usuarios.length === 1 ? "usuário logado" : "usuários logados"
        }.`,
      );
    } else if (anterior === "indisponivel") {
      this.registrarSemFalhar(
        "info",
        "A lista de usuários logados voltou a ficar disponível.",
      );
    }

    this.aplicarInstantaneo({
      estado: "disponivel",
      usuarios,
      atualizadoEm: new Date().toISOString(),
    });
  }

  private definirIndisponivel(): void {
    const anterior = this.estadoAnterior;
    this.estadoAnterior = "indisponivel";

    if (anterior !== "indisponivel") {
      this.registrarSemFalhar(
        "erro",
        `Não foi possível ler a lista de usuários logados. Nova tentativa em ${
          Math.round(this.intervaloReleituraMs / 1000)
        } segundos.`,
      );
    }

    this.aplicarInstantaneo(criarInstantaneoIndisponivel());
  }

  private aplicarInstantaneo(instantaneo: InstantaneoLogados): void {
    this.instantaneo = instantaneo;
    const assinatura = assinar(instantaneo.estado, instantaneo.usuarios);
    if (assinatura === this.assinatura) {
      return;
    }

    this.assinatura = assinatura;
    try {
      this.aoMudar(copiarInstantaneo(instantaneo));
    } catch {
      this.registrarSemFalhar(
        "erro",
        "Falha ao notificar a mudança da lista de usuários logados.",
      );
    }
  }

  private registrarSemFalhar(
    nivel: NivelRegistroMonitor,
    mensagem: string,
  ): void {
    try {
      this.registrar(nivel, mensagem);
    } catch {
      return;
    }
  }

  private fecharConexaoAtual(): void {
    if (this.conexao !== null) {
      fecharConexao(this.conexao);
      this.conexao = null;
    }
  }
}
