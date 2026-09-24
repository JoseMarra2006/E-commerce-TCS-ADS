import {
  ehResultadoDeSucesso,
  type GerenciadorPool,
} from "./pool/gerenciador-pool.ts";
import { mascararCorpoParaRegistro } from "./utilitarios/mascarar.ts";
import {
  criarRespostaErro,
  MENSAGEM_ERRO_INTERNO,
} from "./utilitarios/respostas-erro.ts";
import type { Registro } from "./estado.ts";

const TEMPO_LIMITE_ENCERRAMENTO_MS = 10000;

export interface OpcoesRecepcao {
  porta: number;
  gerenciadorPool: GerenciadorPool;
  registrar: (registro: Registro) => void;
}

export interface Recepcao {
  encerrar(): Promise<void>;
}

export function iniciarRecepcao(opcoes: OpcoesRecepcao): Recepcao {
  const servidor = Deno.serve(
    {
      hostname: "0.0.0.0",
      port: opcoes.porta,
      onListen: () => {},
      onError: () => criarRespostaErro(500, MENSAGEM_ERRO_INTERNO),
    },
    async (request: Request, info: Deno.ServeHandlerInfo) => {
      const inicio = performance.now();
      const url = new URL(request.url);
      const textoCorpo = await request.text();
      const corpoRequisicao = textoCorpo.length === 0 ? null : textoCorpo;

      const resultado = await opcoes.gerenciadorPool.processar({
        metodo: request.method,
        url: request.url,
        cabecalhos: Array.from(request.headers),
        corpo: corpoRequisicao,
      });

      const duracaoMs = performance.now() - inicio;
      const ipOrigem = info.remoteAddr.transport === "tcp" ||
          info.remoteAddr.transport === "udp"
        ? info.remoteAddr.hostname
        : "desconhecido";

      const resposta = ehResultadoDeSucesso(resultado)
        ? new Response(resultado.corpo, {
          status: resultado.status,
          headers: resultado.cabecalhos,
        })
        : criarRespostaErro(500, MENSAGEM_ERRO_INTERNO);

      const status = ehResultadoDeSucesso(resultado) ? resultado.status : 500;
      const numeroThread = resultado.numeroThread;
      const corpoRecebidoRegistro = ehResultadoDeSucesso(resultado)
        ? resultado.corpoRecebidoRegistro
        : mascararCorpoParaRegistro(corpoRequisicao);
      const corpoEnviadoRegistro = ehResultadoDeSucesso(resultado)
        ? resultado.corpoEnviadoRegistro
        : mascararCorpoParaRegistro(
          JSON.stringify({ mensagem: MENSAGEM_ERRO_INTERNO }),
        );

      opcoes.registrar({
        tipo: "requisicao",
        horario: new Date().toISOString(),
        thread: numeroThread,
        metodo: request.method,
        caminho: url.pathname + url.search,
        status,
        duracaoMs,
        ipOrigem,
        corpoRecebido: corpoRecebidoRegistro,
        corpoEnviado: corpoEnviadoRegistro,
      });

      return resposta;
    },
  );

  return {
    async encerrar(): Promise<void> {
      let timeoutId!: ReturnType<typeof setTimeout>;
      const tempoLimite = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => resolve(), TEMPO_LIMITE_ENCERRAMENTO_MS);
      });

      await Promise.race([servidor.shutdown(), tempoLimite]);
      clearTimeout(timeoutId);
    },
  };
}
