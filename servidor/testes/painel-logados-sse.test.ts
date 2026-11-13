import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import type { UsuarioLogado } from "../src/logados/consulta-usuarios-logados.ts";
import type { InstantaneoLogados } from "../src/logados/monitor-usuarios-logados.ts";
import { criarAplicacaoPainel } from "../src/painel/aplicacao-painel.ts";
import {
  type FonteUsuariosLogados,
  serializarLogadosParaSse,
} from "../src/painel/logados-painel.ts";
import { criarCaminhoBancoTemporario } from "./auxiliares/banco-temporario.ts";
import {
  type ClienteSse,
  lerFluxoSse,
} from "./auxiliares/cliente-sse-teste.ts";
import { criarCaminhoSegredoTemporario } from "./auxiliares/segredo-temporario.ts";

const PORTA_PAINEL = 4321;
const HOST = `127.0.0.1:${PORTA_PAINEL}`;
const CHAVES = ["id", "nome", "email", "tipo", "sessoes", "desde"];

type Ouvinte = (instantaneo: InstantaneoLogados) => void;

class FonteFalsa implements FonteUsuariosLogados {
  atual: InstantaneoLogados = {
    estado: "disponivel",
    usuarios: [],
    atualizadoEm: "2026-01-01T00:00:00.000Z",
  };
  readonly ouvintes = new Set<Ouvinte>();
  inscricoes = 0;
  falharObter = false;
  falharInscrever = false;

  obter = (): InstantaneoLogados => {
    if (this.falharObter) {
      throw new Error("obter quebrado");
    }
    return this.atual;
  };

  inscrever = (ouvinte: Ouvinte): () => void => {
    if (this.falharInscrever) {
      throw new Error("inscrever quebrado");
    }
    this.inscricoes++;
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  };

  emitir(instantaneo: InstantaneoLogados): void {
    this.atual = instantaneo;
    for (const ouvinte of [...this.ouvintes]) {
      ouvinte(instantaneo);
    }
  }
}

interface Contexto {
  fonte: FonteFalsa;
  sinal: AbortController;
  conectar: (host?: string) => Promise<ClienteSse>;
  requisitar: (host?: string) => Promise<Response>;
}

function usuario(id: number, nome: string, sessoes = 1): UsuarioLogado {
  return {
    id,
    nome,
    email: `u${id}@teste.com`,
    tipo: id === 1 ? "administrador" : "comum",
    sessoes,
    desde: "2026-01-01T00:00:00.000Z",
  };
}

function instantaneo(usuarios: UsuarioLogado[]): InstantaneoLogados {
  return {
    estado: "disponivel",
    usuarios,
    atualizadoEm: new Date().toISOString(),
  };
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarAte(
  condicao: () => boolean,
  descricao: string,
): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > 1000) {
      throw new Error(`Condição não atingida: ${descricao}.`);
    }
    await esperar(5);
  }
}

function eventosLogados(cliente: ClienteSse) {
  return cliente.eventos.filter((e) => e.evento === "logados");
}

function ultimoLogados(cliente: ClienteSse): InstantaneoLogados {
  const lista = eventosLogados(cliente);
  return JSON.parse(lista[lista.length - 1].dados);
}

async function comPainel(
  teste: (contexto: Contexto) => Promise<void>,
  fonte = new FonteFalsa(),
): Promise<void> {
  const sinal = new AbortController();
  const controlador = new ControladorServidor({
    caminhoBanco: criarCaminhoBancoTemporario(),
    caminhoSegredoJwt: criarCaminhoSegredoTemporario(),
  });
  const app = await criarAplicacaoPainel({
    controlador,
    token: "token-de-teste",
    obterPortaPainel: () => PORTA_PAINEL,
    encerrarProcesso: () => {},
    sinalEncerramento: sinal.signal,
    fonteLogados: fonte,
  });
  const clientes: ClienteSse[] = [];
  const requisitar = async (host = HOST) =>
    await app.request("/eventos", { headers: { Host: host } });
  try {
    await teste({
      fonte,
      sinal,
      requisitar,
      conectar: async (host = HOST) => {
        const resposta = await requisitar(host);
        assertEquals(resposta.status, 200);
        const cliente = lerFluxoSse(resposta);
        clientes.push(cliente);
        await cliente.esperar(
          (eventos) => eventos.some((e) => e.evento === "logados"),
          "logados inicial",
        );
        return cliente;
      },
    });
  } finally {
    for (const cliente of clientes) {
      await cliente.fechar();
    }
    sinal.abort();
    await esperar(10);
  }
}

Deno.test("ao conectar, o cliente recebe estado e logo depois o instantâneo atual de logados", async () => {
  const fonte = new FonteFalsa();
  fonte.atual = instantaneo([usuario(1, "Admin"), usuario(2, "Ana", 2)]);
  await comPainel(async ({ conectar }) => {
    const cliente = await conectar();
    assertEquals(cliente.eventos[0].evento, "estado");
    assertEquals(cliente.eventos[1].evento, "logados");
    assertEquals(JSON.parse(cliente.eventos[1].dados), fonte.atual);
    assertEquals(cliente.eventos[1].campos, ["event", "data"]);
  }, fonte);
});

Deno.test("cada mudança chega a todos os clientes; quem sai não afeta os outros", async () => {
  await comPainel(async ({ fonte, conectar }) => {
    const clientes = [await conectar(), await conectar(), await conectar()];
    assertEquals(fonte.ouvintes.size, 3);
    const primeiro = instantaneo([usuario(2, "Ana")]);
    fonte.emitir(primeiro);
    for (const cliente of clientes) {
      await cliente.esperar(
        () => eventosLogados(cliente).length === 2,
        "primeira mudança",
      );
      assertEquals(ultimoLogados(cliente), primeiro);
    }
    await clientes[1].fechar();
    await esperarAte(() => fonte.ouvintes.size === 2, "remover ouvinte");
    const segundo = instantaneo([usuario(2, "Ana"), usuario(3, "Bruno")]);
    fonte.emitir(segundo);
    for (const cliente of [clientes[0], clientes[2]]) {
      await cliente.esperar(
        () => eventosLogados(cliente).length === 3,
        "segunda mudança",
      );
      assertEquals(ultimoLogados(cliente), segundo);
    }
    assertEquals(eventosLogados(clientes[1]).length, 2);
  });
});

Deno.test("reconectar várias vezes não acumula ouvintes", async () => {
  await comPainel(async ({ fonte, conectar }) => {
    const fixo = await conectar();
    for (let i = 0; i < 10; i++) {
      const cliente = await conectar();
      await cliente.fechar();
      await esperarAte(() => fonte.ouvintes.size === 1, `reconexão ${i}`);
    }
    assertEquals(fonte.inscricoes, 11);
    fonte.atual = instantaneo([usuario(5, "Eva")]);
    const novo = await conectar();
    assertEquals(ultimoLogados(novo), fonte.atual);
    assertEquals(fonte.ouvintes.size, 2);
    assert(!fixo.terminou());
  });
});

Deno.test("enquadramento SSE: caracteres problemáticos chegam intactos e não criam eventos nem campos extras", async () => {
  const nomes = [
    "Linha\nevent: falso\ndata: injetado",
    "Retorno\rdata: x",
    "CRLF\r\n\r\nid: 99",
    "Separadores \u2028 e \u2029 Unicode",
    'Aspas " e barra \\ e \\n literal',
    "Emoji 🚀👩🏽‍💻 e acentos Çãõé",
    ": comentário\nretry: 1",
  ];
  await comPainel(async ({ fonte, conectar }) => {
    const cliente = await conectar();
    const usuarios = nomes.map((nome, i) => ({
      ...usuario(i + 2, nome),
      email: `${nome}@x.com`,
    }));
    const esperado = instantaneo(usuarios);
    fonte.emitir(esperado);
    await cliente.esperar(
      () => eventosLogados(cliente).length === 2,
      "evento com nomes problemáticos",
    );
    await esperar(30);
    assertEquals(cliente.eventos.length, 3);
    assertEquals(
      cliente.eventos.map((e) => e.evento),
      ["estado", "logados", "logados"],
    );
    for (const evento of cliente.eventos) {
      assertEquals(evento.campos, ["event", "data"]);
    }
    assertEquals(ultimoLogados(cliente), esperado);
    const bruto = cliente.bruto();
    assertEquals(bruto.includes("\u2028"), false);
    assertEquals(bruto.includes("\u2029"), false);
    assertEquals(bruto.includes("\r"), false);
  });
});

Deno.test("serialização projeta só as 6 chaves e escapa U+2028 e U+2029", () => {
  const comExtras = {
    ...usuario(2, "Ana\u2028Souza\u2029"),
    token: "eyJ.segredo.assinatura",
    senha_hash: "hash",
    senha_salt: "salt",
    sessaoId: "9f1c2e3a",
  } as UsuarioLogado;
  const texto = serializarLogadosParaSse(instantaneo([comExtras]));
  assertEquals(/[\r\n\u2028\u2029]/.test(texto), false);
  const lido = JSON.parse(texto);
  assertEquals(Object.keys(lido), ["estado", "usuarios", "atualizadoEm"]);
  assertEquals(Object.keys(lido.usuarios[0]), CHAVES);
  assertEquals(lido.usuarios[0].nome, "Ana\u2028Souza\u2029");
  for (const proibido of ["eyJ", "hash", "salt", "9f1c2e3a"]) {
    assertEquals(texto.includes(proibido), false, proibido);
  }
});

Deno.test("fonte que falha ao obter ou ao inscrever não derruba o fluxo", async () => {
  const fonte = new FonteFalsa();
  fonte.falharObter = true;
  await comPainel(async ({ conectar }) => {
    const cliente = await conectar();
    assertEquals(ultimoLogados(cliente), {
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
  }, fonte);

  const semInscricao = new FonteFalsa();
  semInscricao.falharInscrever = true;
  await comPainel(async ({ conectar }) => {
    const cliente = await conectar();
    assertEquals(ultimoLogados(cliente), semInscricao.atual);
    assertEquals(cliente.eventos[0].evento, "estado");
  }, semInscricao);
});

Deno.test("cliente que não consome é descartado sem travar os outros", async () => {
  await comPainel(async ({ fonte, conectar, requisitar }) => {
    const leitor = await conectar();
    const parado = await requisitar();
    assertEquals(parado.status, 200);
    await esperarAte(() => fonte.ouvintes.size === 2, "dois inscritos");
    let ultimo = instantaneo([]);
    for (let lote = 0; lote < 30; lote++) {
      for (let i = 0; i < 50; i++) {
        ultimo = instantaneo([usuario(lote * 50 + i + 2, `Lote ${lote}`)]);
        fonte.emitir(ultimo);
      }
      await esperar(5);
    }
    await esperarAte(() => fonte.ouvintes.size === 1, "descartar o parado");
    await leitor.esperar(
      () => eventosLogados(leitor).length === 1501,
      "leitor recebe todas as mudanças",
      3000,
    );
    assertEquals(ultimoLogados(leitor), ultimo);
    assert(!leitor.terminou());
    await parado.body?.cancel();
  });
});

Deno.test("encerramento do painel termina os fluxos e remove os ouvintes", async () => {
  await comPainel(async ({ fonte, sinal, conectar, requisitar }) => {
    const clientes = [await conectar(), await conectar()];
    assertEquals(fonte.ouvintes.size, 2);
    sinal.abort();
    for (const cliente of clientes) {
      await esperarAte(() => cliente.terminou(), "fluxo terminado");
    }
    assertEquals(fonte.ouvintes.size, 0);
    const recusada = await requisitar();
    assertEquals(recusada.status, 503);
    await recusada.body?.cancel();
    assertEquals(fonte.ouvintes.size, 0);
  });
});

Deno.test("fluxo com Host de outro domínio é recusado sem criar inscrição", async () => {
  await comPainel(async ({ fonte, requisitar }) => {
    for (
      const host of [
        "exemplo-malicioso.com",
        `127.0.0.1:${PORTA_PAINEL + 1}`,
        `localhost.evil:${PORTA_PAINEL}`,
        "",
      ]
    ) {
      const resposta = await requisitar(host);
      assertEquals(resposta.status, 403);
      assertEquals(await resposta.text(), "Acesso negado.");
      assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), null);
    }
    assertEquals(fonte.inscricoes, 0);
    const permitido = await requisitar(`localhost:${PORTA_PAINEL}`);
    assertEquals(permitido.status, 200);
    assertEquals(
      permitido.headers.get("Content-Type"),
      "text/event-stream",
    );
    assertEquals(permitido.headers.get("X-Content-Type-Options"), "nosniff");
    assertEquals(permitido.headers.get("Access-Control-Allow-Origin"), null);
    await permitido.body?.cancel();
    await esperarAte(() => fonte.ouvintes.size === 0, "cancelar permitido");
  });
});
