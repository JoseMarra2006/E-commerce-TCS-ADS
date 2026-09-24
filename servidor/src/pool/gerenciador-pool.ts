import { ehMensagemDaThread } from "./mensagens.ts";
import type { MensagemDaThread, MensagemParaThread } from "./mensagens.ts";

const QUANTIDADE_MINIMA_THREADS = 2;
const QUANTIDADE_MAXIMA_THREADS = 8;
const TEMPO_LIMITE_INICIALIZACAO_MS = 10000;
const TEMPO_LIMITE_REQUISICAO_MS = 30000;
const TEMPO_LIMITE_ENCERRAMENTO_THREAD_MS = 2000;

export interface EstadoThread {
  numero: number;
  pronta: boolean;
  emAndamento: number;
}

export interface RequisicaoParaProcessar {
  metodo: string;
  url: string;
  cabecalhos: [string, string][];
  corpo: string | null;
}

export interface SucessoProcessamento {
  status: number;
  cabecalhos: [string, string][];
  corpo: string | null;
  corpoRecebidoRegistro: string | null;
  corpoEnviadoRegistro: string | null;
  numeroThread: number;
}

export type TipoFalhaProcessamento =
  | "tempo_esgotado"
  | "thread_falhou"
  | "encerrando";

export interface FalhaProcessamento {
  falha: TipoFalhaProcessamento;
  numeroThread: number | null;
}

export type ResultadoProcessamento = SucessoProcessamento | FalhaProcessamento;

interface InfoThread {
  numero: number;
  worker: Worker;
  pronta: boolean;
  emAndamento: number;
}

interface Pendencia {
  numeroThread: number;
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (resultado: ResultadoProcessamento) => void;
}

interface ItemFila {
  id: number;
  requisicao: RequisicaoParaProcessar;
  resolve: (resultado: ResultadoProcessamento) => void;
}

export function ehResultadoDeSucesso(
  resultado: ResultadoProcessamento,
): resultado is SucessoProcessamento {
  return "status" in resultado;
}

export class GerenciadorPool extends EventTarget {
  private readonly quantidadeThreads: number;
  private readonly threads = new Map<number, InfoThread>();
  private readonly pendentes = new Map<number, Pendencia>();
  private readonly filaEspera: ItemFila[] = [];
  private readonly resolvedoresProntidao = new Map<number, () => void>();
  private readonly resolvedoresEncerramento = new Map<number, () => void>();
  private proximoId = 1;
  private contadorRodizio = 0;
  private encerrando = false;

  constructor() {
    super();
    const nucleos = navigator.hardwareConcurrency || QUANTIDADE_MINIMA_THREADS;
    this.quantidadeThreads = Math.min(
      QUANTIDADE_MAXIMA_THREADS,
      Math.max(QUANTIDADE_MINIMA_THREADS, nucleos),
    );
  }

  async iniciar(): Promise<void> {
    const promessasProntidao: Promise<void>[] = [];

    for (let numero = 1; numero <= this.quantidadeThreads; numero++) {
      promessasProntidao.push(this.criarThread(numero));
    }

    let timeoutId!: ReturnType<typeof setTimeout>;
    const promessaTempoLimite = new Promise<"tempo_esgotado">((resolve) => {
      timeoutId = setTimeout(
        () => resolve("tempo_esgotado"),
        TEMPO_LIMITE_INICIALIZACAO_MS,
      );
    });

    const resultado = await Promise.race([
      Promise.all(promessasProntidao).then(() => "ok" as const),
      promessaTempoLimite,
    ]);

    clearTimeout(timeoutId);

    if (resultado === "tempo_esgotado") {
      await this.encerrar();
      throw new Error(
        "As threads de processamento não puderam ser iniciadas.",
      );
    }
  }

  processar(
    requisicao: RequisicaoParaProcessar,
  ): Promise<ResultadoProcessamento> {
    return new Promise((resolve) => {
      if (this.encerrando) {
        resolve({ falha: "encerrando", numeroThread: null });
        return;
      }

      const id = this.proximoId++;
      const item: ItemFila = { id, requisicao, resolve };
      const thread = this.escolherThreadDisponivel();

      if (thread === null) {
        this.filaEspera.push(item);
        return;
      }

      this.despacharParaThread(thread, item);
    });
  }

  async substituirThread(numero: number): Promise<void> {
    await this.trocarThread(numero);
    this.emitirSistema("info", `A thread ${numero} foi substituída.`);
  }

  async encerrar(): Promise<void> {
    this.encerrando = true;

    for (const pendencia of this.pendentes.values()) {
      clearTimeout(pendencia.timeoutId);
      pendencia.resolve({
        falha: "encerrando",
        numeroThread: pendencia.numeroThread,
      });
    }
    this.pendentes.clear();

    for (const item of this.filaEspera) {
      item.resolve({ falha: "encerrando", numeroThread: null });
    }
    this.filaEspera.length = 0;

    const promessas: Promise<void>[] = [];
    for (const info of this.threads.values()) {
      promessas.push(this.encerrarThreadIndividual(info));
    }

    await Promise.all(promessas);
    this.threads.clear();
    this.resolvedoresProntidao.clear();
    this.resolvedoresEncerramento.clear();
  }

  obterEstadoThreads(): EstadoThread[] {
    return Array.from(this.threads.values()).map((info) => ({
      numero: info.numero,
      pronta: info.pronta,
      emAndamento: info.emAndamento,
    }));
  }

  private criarThread(numero: number): Promise<void> {
    return new Promise((resolve) => {
      const worker = new Worker(
        new URL("./trabalhador.ts", import.meta.url).href,
        { type: "module" },
      );

      const info: InfoThread = {
        numero,
        worker,
        pronta: false,
        emAndamento: 0,
      };
      this.threads.set(numero, info);

      worker.onmessage = (evento: MessageEvent<unknown>) => {
        this.tratarMensagemThread(numero, evento.data);
      };

      worker.onerror = (evento: ErrorEvent) => {
        evento.preventDefault();
        this.tratarFalhaThread(
          numero,
          evento.message || "falha desconhecida na thread",
        );
      };

      worker.onmessageerror = () => {
        this.tratarFalhaThread(numero, "mensagem inválida recebida da thread");
      };

      this.resolvedoresProntidao.set(numero, resolve);

      const mensagem: MensagemParaThread = { tipo: "iniciar", numero };
      worker.postMessage(mensagem);
    });
  }

  private tratarMensagemThread(numero: number, dado: unknown): void {
    if (!ehMensagemDaThread(dado)) {
      return;
    }

    if (dado.tipo === "pronta") {
      const info = this.threads.get(numero);
      if (info) {
        info.pronta = true;
      }
      this.emitirEstado();

      const resolvedor = this.resolvedoresProntidao.get(numero);
      if (resolvedor) {
        resolvedor();
        this.resolvedoresProntidao.delete(numero);
      }

      this.despacharFila();
      return;
    }

    if (dado.tipo === "resposta") {
      this.tratarResposta(numero, dado);
      return;
    }

    if (dado.tipo === "encerrada") {
      const resolvedor = this.resolvedoresEncerramento.get(numero);
      if (resolvedor) {
        resolvedor();
      }
    }
  }

  private tratarResposta(
    numero: number,
    dado: Extract<MensagemDaThread, { tipo: "resposta" }>,
  ): void {
    const pendencia = this.pendentes.get(dado.id);
    if (!pendencia) {
      return;
    }

    clearTimeout(pendencia.timeoutId);
    this.pendentes.delete(dado.id);

    const info = this.threads.get(numero);
    if (info) {
      info.emAndamento = Math.max(0, info.emAndamento - 1);
      this.emitirEstado();
    }

    pendencia.resolve({
      status: dado.status,
      cabecalhos: dado.cabecalhos,
      corpo: dado.corpo,
      corpoRecebidoRegistro: dado.corpoRecebidoRegistro,
      corpoEnviadoRegistro: dado.corpoEnviadoRegistro,
      numeroThread: numero,
    });
  }

  private tratarFalhaThread(numero: number, motivo: string): void {
    if (this.encerrando) {
      return;
    }

    this.falharPendentesDaThread(numero, "thread_falhou");

    void this.trocarThread(numero).then(() => {
      this.emitirSistema(
        "erro",
        `A thread ${numero} falhou e foi substituída: ${motivo}.`,
      );
    });
  }

  private falharPendentesDaThread(
    numero: number,
    tipoFalha: TipoFalhaProcessamento,
  ): void {
    for (const [id, pendencia] of this.pendentes) {
      if (pendencia.numeroThread === numero) {
        clearTimeout(pendencia.timeoutId);
        this.pendentes.delete(id);
        pendencia.resolve({ falha: tipoFalha, numeroThread: numero });
      }
    }
  }

  private despacharParaThread(thread: InfoThread, item: ItemFila): void {
    thread.emAndamento++;
    this.emitirEstado();

    const timeoutId = setTimeout(() => {
      this.tratarTempoEsgotado(item.id);
    }, TEMPO_LIMITE_REQUISICAO_MS);

    this.pendentes.set(item.id, {
      resolve: item.resolve,
      numeroThread: thread.numero,
      timeoutId,
    });

    const mensagem: MensagemParaThread = {
      tipo: "requisicao",
      id: item.id,
      metodo: item.requisicao.metodo,
      url: item.requisicao.url,
      cabecalhos: item.requisicao.cabecalhos,
      corpo: item.requisicao.corpo,
    };

    thread.worker.postMessage(mensagem);
  }

  private tratarTempoEsgotado(id: number): void {
    const pendencia = this.pendentes.get(id);
    if (!pendencia) {
      return;
    }

    this.pendentes.delete(id);
    const numeroThread = pendencia.numeroThread;
    pendencia.resolve({ falha: "tempo_esgotado", numeroThread });

    this.falharPendentesDaThread(numeroThread, "thread_falhou");

    void this.trocarThread(numeroThread).then(() => {
      this.emitirSistema(
        "erro",
        `A thread ${numeroThread} não respondeu em 30 segundos e foi substituída.`,
      );
    });
  }

  private despacharFila(): void {
    while (this.filaEspera.length > 0) {
      const thread = this.escolherThreadDisponivel();
      if (thread === null) {
        break;
      }

      const item = this.filaEspera.shift();
      if (!item) {
        break;
      }

      this.despacharParaThread(thread, item);
    }
  }

  private escolherThreadDisponivel(): InfoThread | null {
    const prontas = Array.from(this.threads.values()).filter((t) => t.pronta);
    if (prontas.length === 0) {
      return null;
    }

    let menorCarga = Infinity;
    for (const thread of prontas) {
      if (thread.emAndamento < menorCarga) {
        menorCarga = thread.emAndamento;
      }
    }

    const empatadas = prontas
      .filter((thread) => thread.emAndamento === menorCarga)
      .sort((a, b) => a.numero - b.numero);

    this.contadorRodizio = (this.contadorRodizio + 1) % empatadas.length;
    return empatadas[this.contadorRodizio];
  }

  private async trocarThread(numero: number): Promise<void> {
    const infoAntiga = this.threads.get(numero);

    if (infoAntiga) {
      infoAntiga.pronta = false;
      this.emitirEstado();
      infoAntiga.worker.onmessage = null;
      infoAntiga.worker.onerror = null;
      infoAntiga.worker.onmessageerror = null;
      infoAntiga.worker.terminate();
    }

    this.resolvedoresProntidao.delete(numero);

    if (!this.encerrando) {
      await this.criarThread(numero);
    }
  }

  private encerrarThreadIndividual(info: InfoThread): Promise<void> {
    return new Promise((resolve) => {
      let concluido = false;

      const finalizar = () => {
        if (concluido) {
          return;
        }
        concluido = true;
        clearTimeout(timeoutId);
        this.resolvedoresEncerramento.delete(info.numero);
        info.worker.onmessage = null;
        info.worker.onerror = null;
        info.worker.onmessageerror = null;
        info.worker.terminate();
        resolve();
      };

      const timeoutId = setTimeout(
        finalizar,
        TEMPO_LIMITE_ENCERRAMENTO_THREAD_MS,
      );
      this.resolvedoresEncerramento.set(info.numero, finalizar);

      try {
        const mensagem: MensagemParaThread = { tipo: "encerrar" };
        info.worker.postMessage(mensagem);
      } catch {
        finalizar();
      }
    });
  }

  private emitirEstado(): void {
    this.dispatchEvent(
      new CustomEvent<EstadoThread[]>("estado", {
        detail: this.obterEstadoThreads(),
      }),
    );
  }

  private emitirSistema(nivel: "info" | "erro", mensagem: string): void {
    this.dispatchEvent(
      new CustomEvent<{ nivel: "info" | "erro"; mensagem: string }>(
        "sistema",
        { detail: { nivel, mensagem } },
      ),
    );
  }
}
