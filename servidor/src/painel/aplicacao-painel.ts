import { Hono } from "@hono/hono";
import { streamSSE } from "@hono/hono/streaming";
import type { ControladorServidor } from "../controlador-servidor.ts";
import { validarPorta } from "../utilitarios/validar-porta.ts";
import type { EstadoServidor, Registro } from "../estado.ts";
import type { InstantaneoLogados } from "../logados/monitor-usuarios-logados.ts";
import {
  criarFonteLogadosDoControlador,
  EVENTO_SSE_LOGADOS,
  type FonteUsuariosLogados,
  serializarLogadosParaSse,
} from "./logados-painel.ts";

const MARCADOR_TOKEN = "{{TOKEN_PAINEL}}";
const INTERVALO_PING_MS = 15000;
const INTERVALO_MINIMO_ESTADO_MS = 100;
const LIMITE_FILA_CLIENTE = 1000;

const CABECALHOS_SEGURANCA: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export interface OpcoesAplicacaoPainel {
  controlador: ControladorServidor;
  token: string;
  obterPortaPainel: () => number;
  encerrarProcesso: () => void;
  sinalEncerramento: AbortSignal;
  fonteLogados?: FonteUsuariosLogados;
}

function compararEmTempoConstante(a: string, b: string): boolean {
  const tamanho = Math.max(a.length, b.length);
  let resultado = a.length === b.length ? 0 : 1;

  for (let indice = 0; indice < tamanho; indice++) {
    const codigoA = a.charCodeAt(indice) || 0;
    const codigoB = b.charCodeAt(indice) || 0;
    resultado |= codigoA ^ codigoB;
  }

  return resultado === 0;
}

function obterLogadosSerializados(fonte: FonteUsuariosLogados): string {
  try {
    return serializarLogadosParaSse(fonte.obter());
  } catch {
    return serializarLogadosParaSse({
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
  }
}

export async function criarAplicacaoPainel(
  opcoes: OpcoesAplicacaoPainel,
): Promise<Hono> {
  const diretorioPublico = new URL("./publico/", import.meta.url);
  const conteudoIndex = await Deno.readTextFile(
    new URL("./index.html", diretorioPublico),
  );
  const conteudoCss = await Deno.readTextFile(
    new URL("./painel.css", diretorioPublico),
  );
  const conteudoJs = await Deno.readTextFile(
    new URL("./painel.js", diretorioPublico),
  );
  const conteudoIcone = await Deno.readTextFile(
    new URL("./favicon.svg", diretorioPublico),
  );

  const conteudoIndexComToken = conteudoIndex.replaceAll(
    MARCADOR_TOKEN,
    opcoes.token,
  );

  const fonteLogados = opcoes.fonteLogados ??
    criarFonteLogadosDoControlador(opcoes.controlador);

  const app = new Hono();

  app.use("*", async (c, next) => {
    const portaAtual = opcoes.obterPortaPainel();
    const hostRecebido = c.req.header("Host") ?? "";
    const hostValido = hostRecebido === `127.0.0.1:${portaAtual}` ||
      hostRecebido === `localhost:${portaAtual}`;

    if (!hostValido) {
      return new Response("Acesso negado.", {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...CABECALHOS_SEGURANCA,
        },
      });
    }

    await next();

    for (const nomeCabecalho of Object.keys(CABECALHOS_SEGURANCA)) {
      c.res.headers.set(nomeCabecalho, CABECALHOS_SEGURANCA[nomeCabecalho]);
    }
  });

  app.use("*", async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return;
    }

    const portaAtual = opcoes.obterPortaPainel();
    const origemRecebida = c.req.header("Origin") ?? "";
    const origemValida = origemRecebida === `http://127.0.0.1:${portaAtual}` ||
      origemRecebida === `http://localhost:${portaAtual}`;

    const tokenRecebido = c.req.header("X-Token-Painel") ?? "";
    const tokenValido = compararEmTempoConstante(tokenRecebido, opcoes.token);

    if (!origemValida || !tokenValido) {
      return c.json({ ok: false, mensagem: "Acesso negado." }, 403);
    }

    await next();
  });

  app.onError((_erro, c) => {
    return c.text("Erro interno no servidor.", 500);
  });

  app.notFound((c) => {
    return c.text("Não encontrado.", 404);
  });

  app.get("/", () => {
    return new Response(conteudoIndexComToken, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });

  app.get("/painel.css", () => {
    return new Response(conteudoCss, {
      headers: { "Content-Type": "text/css; charset=utf-8" },
    });
  });

  app.get("/painel.js", () => {
    return new Response(conteudoJs, {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  });

  app.get("/favicon.svg", () => {
    return new Response(conteudoIcone, {
      headers: { "Content-Type": "image/svg+xml" },
    });
  });

  app.get("/eventos", (c) => {
    if (opcoes.sinalEncerramento.aborted) {
      return c.text("Servidor encerrando.", 503);
    }

    return streamSSE(c, async (stream) => {
      let ativo = true;
      let descartado = false;
      let resolvedorEspera: (() => void) | null = null;
      const fila: { evento: string; dados: string }[] = [];

      const acordar = () => {
        if (resolvedorEspera) {
          const resolver = resolvedorEspera;
          resolvedorEspera = null;
          resolver();
        }
      };

      let finalizarConexao = () => {};

      const enfileirar = (evento: string, dados: string) => {
        if (!ativo) {
          return;
        }
        if (fila.length >= LIMITE_FILA_CLIENTE) {
          descartado = true;
          fila.length = 0;
          finalizarConexao();
          stream.abort();
          return;
        }
        fila.push({ evento, dados });
        acordar();
      };

      let ultimoEnvioEstadoEm = 0;
      let estadoPendente: EstadoServidor | null = null;
      let temporizadorThrottle: ReturnType<typeof setTimeout> | null = null;

      const listenerEstado = () => {
        const estadoAtual = opcoes.controlador.obterEstado();
        const agora = Date.now();
        const decorrido = agora - ultimoEnvioEstadoEm;

        if (decorrido >= INTERVALO_MINIMO_ESTADO_MS) {
          ultimoEnvioEstadoEm = agora;
          enfileirar("estado", JSON.stringify(estadoAtual));
          return;
        }

        estadoPendente = estadoAtual;

        if (temporizadorThrottle === null) {
          temporizadorThrottle = setTimeout(() => {
            temporizadorThrottle = null;
            if (estadoPendente !== null) {
              ultimoEnvioEstadoEm = Date.now();
              enfileirar("estado", JSON.stringify(estadoPendente));
              estadoPendente = null;
            }
          }, INTERVALO_MINIMO_ESTADO_MS - decorrido);
        }
      };

      const listenerRegistro = (evento: Event) => {
        const registro = (evento as CustomEvent<Registro>).detail;
        enfileirar("registro", JSON.stringify(registro));
      };

      const ouvinteLogados = (instantaneo: InstantaneoLogados) => {
        try {
          enfileirar(EVENTO_SSE_LOGADOS, serializarLogadosParaSse(instantaneo));
        } catch {
          return;
        }
      };

      opcoes.controlador.addEventListener("estado", listenerEstado);
      opcoes.controlador.addEventListener("registro", listenerRegistro);
      let cancelarInscricaoLogados: () => void = () => {};
      try {
        cancelarInscricaoLogados = fonteLogados.inscrever(ouvinteLogados);
      } catch {
        cancelarInscricaoLogados = () => {};
      }

      const temporizadorPing = setInterval(() => {
        enfileirar("ping", "");
      }, INTERVALO_PING_MS);

      finalizarConexao = () => {
        if (!ativo) {
          return;
        }
        ativo = false;
        opcoes.controlador.removeEventListener("estado", listenerEstado);
        opcoes.controlador.removeEventListener("registro", listenerRegistro);
        try {
          cancelarInscricaoLogados();
        } catch {
          cancelarInscricaoLogados = () => {};
        }
        clearInterval(temporizadorPing);
        if (temporizadorThrottle !== null) {
          clearTimeout(temporizadorThrottle);
        }
        opcoes.sinalEncerramento.removeEventListener(
          "abort",
          finalizarConexao,
        );
        acordar();
      };

      opcoes.sinalEncerramento.addEventListener("abort", finalizarConexao);
      stream.onAbort(finalizarConexao);

      await stream.writeSSE({
        event: "estado",
        data: JSON.stringify(opcoes.controlador.obterEstado()),
      });

      await stream.writeSSE({
        event: EVENTO_SSE_LOGADOS,
        data: obterLogadosSerializados(fonteLogados),
      });

      for (const registro of opcoes.controlador.obterRegistros()) {
        await stream.writeSSE({
          event: "registro",
          data: JSON.stringify(registro),
        });
      }

      ultimoEnvioEstadoEm = Date.now();

      while (ativo) {
        if (fila.length === 0) {
          await new Promise<void>((resolve) => {
            resolvedorEspera = resolve;
          });
        }

        if (!ativo) {
          break;
        }

        while (fila.length > 0 && !descartado) {
          const item = fila.shift();
          if (!item) {
            break;
          }
          await stream.writeSSE({ event: item.evento, data: item.dados });
        }
      }
    });
  });

  app.post("/acoes/iniciar", async (c) => {
    const textoCorpo = await c.req.text();
    let dados: unknown = null;

    try {
      dados = textoCorpo.trim().length > 0 ? JSON.parse(textoCorpo) : null;
    } catch {
      dados = null;
    }

    const valorPorta =
      typeof dados === "object" && dados !== null && !Array.isArray(dados)
        ? (dados as Record<string, unknown>).porta
        : undefined;

    if (typeof valorPorta !== "string") {
      return c.json({ ok: false, mensagem: "Informe a porta." });
    }

    const validacao = validarPorta(valorPorta);
    if (!validacao.ok) {
      return c.json({ ok: false, mensagem: validacao.mensagem });
    }

    const resultado = await opcoes.controlador.iniciar(validacao.porta);
    return c.json(resultado);
  });

  app.post("/acoes/parar", async (c) => {
    const resultado = await opcoes.controlador.parar();
    return c.json(resultado);
  });

  app.post("/acoes/encerrar", (c) => {
    setTimeout(() => {
      opcoes.encerrarProcesso();
    }, 50);

    return c.json({
      ok: true,
      mensagem: "Servidor encerrado. Você já pode fechar esta aba.",
    });
  });

  return app;
}
