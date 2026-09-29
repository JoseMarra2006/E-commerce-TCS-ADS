import { ehMensagemDaThread } from "./mensagens.ts";
import type { MensagemDaThread, MensagemParaThread } from "./mensagens.ts";

const QUANTIDADE_MINIMA_THREADS = 2;
const QUANTIDADE_MAXIMA_THREADS = 8;
const TEMPO_LIMITE_INICIALIZACAO_MS = 10000;
const TEMPO_LIMITE_REQUISICAO_MS = 30000;
const TEMPO_LIMITE_ENCERRAMENTO_THREAD_MS = 2000;
const MAXIMO_TENTATIVAS_SUBSTITUICAO = 3;
const INTERVALO_RETENTATIVA_SUBSTITUICAO_MS = 2000;

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

type ResultadoInicializacaoThread =
  | { ok: true }
  | { ok: false; mensagem: string };

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
  timeoutId: ReturnType<typeof setTimeout>;
}

interface TemporizadorSubstituicao {
  timeoutId: ReturnType<typeof setTimeout>;
  resolver: () => void;
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
  private readonly resolvedoresFalhaInicializacao = new Map<
    number,
    (mensagem: string) => void
  >();
  private readonly resolvedoresEncerramento = new Map<number, () => void>();
  private readonly temporizadoresSubstituicao = new Map<
    number,
    TemporizadorSubstituicao
  >();
  private proximoId = 1;
  private contadorRodizio = 0;
  private encerrando = false;
  private caminhoBanco = "";
  private segredoJwt = "";

  constructor() {
    super();
    const nucleos = navigator.hardwareConcurrency || QUANTIDADE_MINIMA_THREADS;
    this.quantidadeThreads = Math.min(
      QUANTIDADE_MAXIMA_THREADS,
      Math.max(QUANTIDADE_MINIMA_THREADS, nucleos),
    );
  }

  async iniciar(caminhoBanco: string, segredoJwt: string): Promise<void> {
    this.caminhoBanco = caminhoBanco;
    this.segredoJwt = segredoJwt;

    const promessasResultado: Promise<ResultadoInicializacaoThread>[] = [];
    for (let numero = 1; numero <= this.quantidadeThreads; numero++) {
      promessasResultado.push(this.criarThread(numero));
    }

    let timeoutId!: ReturnType<typeof setTimeout>;
    const promessaTempoLimite = new Promise<{ tipo: "tempo_esgotado" }>(
      (resolve) => {
        timeoutId = setTimeout(
          () => resolve({ tipo: "tempo_esgotado" }),
          TEMPO_LIMITE_INICIALIZACAO_MS,
        );
      },
    );

    const resultadoCorrida = await Promise.race([
      Promise.all(promessasResultado).then((resultados) => (
        { tipo: "concluido" as const, resultados }
      )),
      promessaTempoLimite,
    ]);

    clearTimeout(timeoutId);

    if (resultadoCorrida.tipo === "tempo_esgotado") {
      await this.encerrar();
      throw new Error(
        "As threads de processamento não puderam ser iniciadas.",
      );
    }

    const falha = resultadoCorrida.resultados.find(
      (resultado): resultado is { ok: false; mensagem: string } =>
        resultado.ok === false,
    );

    if (falha !== undefined) {
      await this.encerrar();
      throw new Error(
        `Não foi possível abrir o banco de dados nas threads: ${falha.mensagem}.`,
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
      const timeoutId = setTimeout(() => {
        this.tratarTempoEsgotado(id);
      }, TEMPO_LIMITE_REQUISICAO_MS);

      const item: ItemFila = { id, requisicao, resolve, timeoutId };
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
    if (this.threads.has(numero)) {
      this.emitirSistema("info", `A thread ${numero} foi substituída.`);
    }
  }

  async encerrar(): Promise<void> {
    this.encerrando = true;

    for (
      const { timeoutId, resolver } of this.temporizadoresSubstituicao.values()
    ) {
      clearTimeout(timeoutId);
      resolver();
    }
    this.temporizadoresSubstituicao.clear();

    for (const pendencia of this.pendentes.values()) {
      clearTimeout(pendencia.timeoutId);
      pendencia.resolve({
        falha: "encerrando",
        numeroThread: pendencia.numeroThread,
      });
    }
    this.pendentes.clear();

    for (const item of this.filaEspera) {
      clearTimeout(item.timeoutId);
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
    this.resolvedoresFalhaInicializacao.clear();
    this.resolvedoresEncerramento.clear();
  }

  obterEstadoThreads(): EstadoThread[] {
    return Array.from(this.threads.values()).map((info) => ({
      numero: info.numero,
      pronta: info.pronta,
      emAndamento: info.emAndamento,
    }));
  }

  private criarThread(numero: number): Promise<ResultadoInicializacaoThread> {
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

      this.resolvedoresProntidao.set(numero, () => resolve({ ok: true }));
      this.resolvedoresFalhaInicializacao.set(
        numero,
        (mensagem) => resolve({ ok: false, mensagem }),
      );

      const mensagem: MensagemParaThread = {
        tipo: "iniciar",
        numero,
        caminhoBanco: this.caminhoBanco,
        segredoJwt: this.segredoJwt,
      };
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

      this.resolvedoresFalhaInicializacao.delete(numero);
      const resolvedor = this.resolvedoresProntidao.get(numero);
      if (resolvedor) {
        resolvedor();
        this.resolvedoresProntidao.delete(numero);
      }

      this.despacharFila();
      return;
    }

    if (dado.tipo === "falha_inicializacao") {
      this.resolvedoresProntidao.delete(numero);
      const resolvedor = this.resolvedoresFalhaInicializacao.get(numero);
      if (resolvedor) {
        resolvedor(dado.mensagem);
        this.resolvedoresFalhaInicializacao.delete(numero);
      }
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
      if (this.threads.has(numero)) {
        this.emitirSistema(
          "erro",
          `A thread ${numero} falhou e foi substituída: ${motivo}.`,
        );
      }
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

    this.pendentes.set(item.id, {
      resolve: item.resolve,
      numeroThread: thread.numero,
      timeoutId: item.timeoutId,
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
    if (pendencia) {
      this.pendentes.delete(id);
      const numeroThread = pendencia.numeroThread;
      pendencia.resolve({ falha: "tempo_esgotado", numeroThread });

      this.falharPendentesDaThread(numeroThread, "thread_falhou");

      void this.trocarThread(numeroThread).then(() => {
        if (this.threads.has(numeroThread)) {
          this.emitirSistema(
            "erro",
            `A thread ${numeroThread} não respondeu em 30 segundos e foi substituída.`,
          );
        }
      });
      return;
    }

    const indiceFila = this.filaEspera.findIndex((item) => item.id === id);
    if (indiceFila !== -1) {
      const [item] = this.filaEspera.splice(indiceFila, 1);
      item.resolve({ falha: "tempo_esgotado", numeroThread: null });
    }
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
      this.desligarWorker(infoAntiga.worker);
      this.threads.delete(numero);
    }

    this.resolvedoresProntidao.delete(numero);
    this.resolvedoresFalhaInicializacao.delete(numero);

    if (this.encerrando) {
      return;
    }

    await this.tentarRecriarThread(numero, 1);
  }

  private async tentarRecriarThread(
    numero: number,
    tentativa: number,
  ): Promise<void> {
    const resultado = await this.criarThread(numero);

    if (resultado.ok) {
      return;
    }

    this.emitirSistema(
      "erro",
      `A thread ${numero} não conseguiu abrir o banco de dados: ${resultado.mensagem}.`,
    );

    const infoFalha = this.threads.get(numero);
    if (infoFalha) {
      this.desligarWorker(infoFalha.worker);
      this.threads.delete(numero);
      this.emitirEstado();
    }

    if (this.encerrando) {
      return;
    }

    if (tentativa >= MAXIMO_TENTATIVAS_SUBSTITUICAO) {
      this.emitirSistema(
        "erro",
        `A thread ${numero} foi desativada após falhas repetidas.`,
      );
      return;
    }

    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.temporizadoresSubstituicao.delete(numero);
        resolve();
      }, INTERVALO_RETENTATIVA_SUBSTITUICAO_MS);
      this.temporizadoresSubstituicao.set(numero, {
        timeoutId,
        resolver: resolve,
      });
    });

    if (this.encerrando) {
      return;
    }

    await this.tentarRecriarThread(numero, tentativa + 1);
  }

  private desligarWorker(worker: Worker): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
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
        this.desligarWorker(info.worker);
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
