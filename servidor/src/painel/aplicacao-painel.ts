import { Hono } from "@hono/hono";
import { streamSSE } from "@hono/hono/streaming";
import type { ControladorServidor } from "../controlador-servidor.ts";
import { validarPorta } from "../utilitarios/validar-porta.ts";
import type { EstadoServidor, Registro } from "../estado.ts";

const MARCADOR_TOKEN = "{{TOKEN_PAINEL}}";
const INTERVALO_PING_MS = 15000;
const INTERVALO_MINIMO_ESTADO_MS = 100;

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

  const conteudoIndexComToken = conteudoIndex.replaceAll(
    MARCADOR_TOKEN,
    opcoes.token,
  );

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

  app.get("/eventos", (c) => {
    if (opcoes.sinalEncerramento.aborted) {
      return c.text("Servidor encerrando.", 503);
    }

    return streamSSE(c, async (stream) => {
      let ativo = true;
      let resolvedorEspera: (() => void) | null = null;
      const fila: { evento: string; dados: string }[] = [];

      const acordar = () => {
        if (resolvedorEspera) {
          const resolver = resolvedorEspera;
          resolvedorEspera = null;
          resolver();
        }
      };

      const enfileirar = (evento: string, dados: string) => {
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

      opcoes.controlador.addEventListener("estado", listenerEstado);
      opcoes.controlador.addEventListener("registro", listenerRegistro);

      const temporizadorPing = setInterval(() => {
        enfileirar("ping", "");
      }, INTERVALO_PING_MS);

      const finalizarConexao = () => {
        if (!ativo) {
          return;
        }
        ativo = false;
        opcoes.controlador.removeEventListener("estado", listenerEstado);
        opcoes.controlador.removeEventListener("registro", listenerRegistro);
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

        while (fila.length > 0) {
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
