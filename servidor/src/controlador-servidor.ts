import { GerenciadorPool } from "./pool/gerenciador-pool.ts";
import { iniciarRecepcao, type Recepcao } from "./recepcao.ts";
import { obterEnderecosAcesso } from "./utilitarios/rede.ts";
import type { EstadoServidor, Registro, StatusServidor } from "./estado.ts";

const LIMITE_REGISTROS = 500;

export interface ResultadoOperacao {
  ok: boolean;
  mensagem: string;
}

export class ControladorServidor extends EventTarget {
  private status: StatusServidor = "parada";
  private porta: number | null = null;
  private mensagemErro: string | null = null;
  private enderecos: string[] = [];
  private pool: GerenciadorPool | null = null;
  private recepcao: Recepcao | null = null;
  private readonly registros: Registro[] = [];

  async iniciar(porta: number): Promise<ResultadoOperacao> {
    if (this.status !== "parada" && this.status !== "erro") {
      return {
        ok: false,
        mensagem: "O servidor já está em execução ou em transição.",
      };
    }

    this.mensagemErro = null;
    this.definirStatus("iniciando");

    const pool = new GerenciadorPool();
    this.pool = pool;
    pool.addEventListener("estado", () => this.emitirEstado());
    pool.addEventListener("sistema", (evento) => {
      const detalhe = (evento as CustomEvent<
        { nivel: "info" | "erro"; mensagem: string }
      >).detail;
      this.registrarSistema(detalhe.nivel, detalhe.mensagem);
    });

    try {
      await pool.iniciar();
    } catch (erro: unknown) {
      this.pool = null;
      const mensagem = erro instanceof Error
        ? erro.message
        : "As threads de processamento não puderam ser iniciadas.";
      this.mensagemErro = mensagem;
      this.definirStatus("erro");
      return { ok: false, mensagem };
    }

    try {
      this.recepcao = iniciarRecepcao({
        porta,
        gerenciadorPool: pool,
        registrar: (registro) => this.adicionarRegistro(registro),
      });
    } catch (erro: unknown) {
      await pool.encerrar();
      this.pool = null;
      const mensagem = this.mensagemDeErroRecepcao(erro, porta);
      this.mensagemErro = mensagem;
      this.definirStatus("erro");
      return { ok: false, mensagem };
    }

    this.porta = porta;
    this.enderecos = obterEnderecosAcesso(porta);
    this.definirStatus("em_execucao");

    const quantidadeThreads = pool.obterEstadoThreads().length;
    const mensagemSucesso =
      `Servidor iniciado na porta ${porta} com ${quantidadeThreads} threads.`;
    this.registrarSistema("info", mensagemSucesso);

    return { ok: true, mensagem: mensagemSucesso };
  }

  async parar(): Promise<ResultadoOperacao> {
    if (this.status !== "em_execucao") {
      return { ok: false, mensagem: "O servidor não está em execução." };
    }

    this.definirStatus("parando");

    if (this.recepcao) {
      await this.recepcao.encerrar();
      this.recepcao = null;
    }

    if (this.pool) {
      await this.pool.encerrar();
      this.pool = null;
    }

    this.porta = null;
    this.enderecos = [];
    this.definirStatus("parada");
    this.registrarSistema("info", "Servidor parado.");

    return { ok: true, mensagem: "Servidor parado." };
  }

  obterEstado(): EstadoServidor {
    return {
      status: this.status,
      porta: this.porta,
      mensagemErro: this.mensagemErro,
      enderecos: [...this.enderecos],
      threads: this.pool ? this.pool.obterEstadoThreads() : [],
    };
  }

  obterRegistros(): Registro[] {
    return [...this.registros];
  }

  async substituirThread(numero: number): Promise<void> {
    if (this.pool) {
      await this.pool.substituirThread(numero);
    }
  }

  private definirStatus(status: StatusServidor): void {
    this.status = status;
    this.emitirEstado();
  }

  private emitirEstado(): void {
    this.dispatchEvent(
      new CustomEvent<EstadoServidor>("estado", { detail: this.obterEstado() }),
    );
  }

  private adicionarRegistro(registro: Registro): void {
    this.registros.push(registro);

    if (this.registros.length > LIMITE_REGISTROS) {
      this.registros.shift();
    }

    this.dispatchEvent(
      new CustomEvent<Registro>("registro", { detail: registro }),
    );
  }

  private registrarSistema(nivel: "info" | "erro", mensagem: string): void {
    this.adicionarRegistro({
      tipo: "sistema",
      horario: new Date().toISOString(),
      nivel,
      mensagem,
    });
  }

  private mensagemDeErroRecepcao(erro: unknown, porta: number): string {
    if (erro instanceof Deno.errors.AddrInUse) {
      return `A porta ${porta} já está em uso por outro programa. Escolha outra porta.`;
    }

    if (erro instanceof Deno.errors.PermissionDenied) {
      return `Sem permissão para usar a porta ${porta}. Escolha uma porta acima de 1024.`;
    }

    if (erro instanceof Error) {
      return `Não foi possível iniciar o servidor: ${erro.message}.`;
    }

    return "Não foi possível iniciar o servidor: erro desconhecido.";
  }
}
