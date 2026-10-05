import { Hono } from "@hono/hono";
import type { Context, Next } from "@hono/hono";
import { servirArquivoEstatico } from "./arquivos-estaticos.ts";
import { compararEmTempoConstante } from "./comparacao-segura.ts";
import { encaminharRequisicao } from "./encaminhar.ts";
import type { OpcoesEncaminhamento } from "./encaminhar.ts";
import { validarPedidoEnvio } from "./pedido-envio.ts";

export type ModoIntermediario = "producao" | "desenvolvimento";

export interface OpcoesAplicacaoIntermediario {
  token: string;
  obterPorta: () => number;
  modo: ModoIntermediario;
  diretorioInterface?: string;
  opcoesEncaminhamento?: OpcoesEncaminhamento;
}

const PORTA_VITE = 5173;
const TAMANHO_MAXIMO_REQUISICAO_BYTES = 2 * 1024 * 1024;
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; " +
  "connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; " +
  "base-uri 'none'; form-action 'self'";

function portasAceitas(opcoes: OpcoesAplicacaoIntermediario): number[] {
  const portas = [opcoes.obterPorta()];
  if (opcoes.modo === "desenvolvimento") {
    portas.push(PORTA_VITE);
  }
  return portas;
}

function hostsAceitos(opcoes: OpcoesAplicacaoIntermediario): string[] {
  return portasAceitas(opcoes).flatMap((porta) => [`127.0.0.1:${porta}`, `localhost:${porta}`]);
}

function origensAceitas(opcoes: OpcoesAplicacaoIntermediario): string[] {
  return hostsAceitos(opcoes).map((host) => `http://${host}`);
}

function tokenConfere(informado: string | undefined, esperado: string): boolean {
  if (informado === undefined) {
    return false;
  }
  const codificador = new TextEncoder();
  return compararEmTempoConstante(codificador.encode(informado), codificador.encode(esperado));
}

async function lerCorpoJson(c: Context): Promise<{ ok: true; dados: unknown } | { ok: false }> {
  const tamanhoDeclarado = Number(c.req.header("content-length") ?? "0");
  if (tamanhoDeclarado > TAMANHO_MAXIMO_REQUISICAO_BYTES) {
    return { ok: false };
  }
  try {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_REQUISICAO_BYTES) {
      return { ok: false };
    }
    return { ok: true, dados: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

function aplicarCabecalhosSeguranca(cabecalhos: Headers): void {
  cabecalhos.set("X-Content-Type-Options", "nosniff");
  cabecalhos.set("Referrer-Policy", "no-referrer");
  cabecalhos.set("X-Frame-Options", "DENY");
}

export function criarAplicacaoIntermediario(opcoes: OpcoesAplicacaoIntermediario): Hono {
  const app = new Hono();
  const producao = opcoes.modo === "producao";

  app.use("*", async (c: Context, next: Next) => {
    if (!hostsAceitos(opcoes).includes(c.req.header("host") ?? "")) {
      const negada = new Response("Acesso negado.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
      aplicarCabecalhosSeguranca(negada.headers);
      return negada;
    }
    await next();
    aplicarCabecalhosSeguranca(c.res.headers);
    if (producao && !new URL(c.req.url).pathname.startsWith("/intermediario")) {
      c.res.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    return undefined;
  });

  app.get("/intermediario/token", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ token: opcoes.token });
  });

  app.post("/intermediario/enviar", async (c) => {
    const origem = c.req.header("origin") ?? "";
    if (
      !origensAceitas(opcoes).includes(origem) ||
      !tokenConfere(c.req.header("x-token-intermediario"), opcoes.token)
    ) {
      return c.json({ mensagem: "Acesso negado." }, 403);
    }

    const leitura = await lerCorpoJson(c);
    if (!leitura.ok) {
      return c.json(
        { mensagem: "O corpo da requisição deve ser um JSON válido de até 2 MB." },
        400,
      );
    }

    const validacao = validarPedidoEnvio(leitura.dados);
    if (!validacao.ok) {
      return c.json({ mensagem: validacao.mensagem }, 400);
    }

    const resultado = await encaminharRequisicao(validacao.pedido, opcoes.opcoesEncaminhamento);
    c.header("Cache-Control", "no-store");
    return c.json(resultado, 200);
  });

  app.all("/intermediario/*", (c) => c.json({ mensagem: "Recurso não encontrado." }, 404));
  app.all("/intermediario", (c) => c.json({ mensagem: "Recurso não encontrado." }, 404));

  app.all("*", (c) => {
    const diretorio = opcoes.diretorioInterface;
    if (!producao || diretorio === undefined) {
      return c.json({ mensagem: "Recurso não encontrado." }, 404);
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return c.json({ mensagem: "Método não permitido." }, 405);
    }
    return servirArquivoEstatico(diretorio, new URL(c.req.url).pathname);
  });

  return app;
}
