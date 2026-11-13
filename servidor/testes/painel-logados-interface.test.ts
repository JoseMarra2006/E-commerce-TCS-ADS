import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import { criarAplicacaoPainel } from "../src/painel/aplicacao-painel.ts";
import {
  decidirExibicao,
  interpretarEventoLogados,
} from "../src/painel/publico/logados-visao.js";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { lerFluxoSse } from "./auxiliares/cliente-sse-teste.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";

const CABECALHOS_SEGURANCA_ESPERADOS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
const PUBLICO = new URL("../src/painel/publico/", import.meta.url);

interface Painel {
  origem: string;
  controlador: ControladorServidor;
  portaApi: () => number;
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

async function comPainel(teste: (painel: Painel) => Promise<void>) {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  const sinal = new AbortController();
  let portaPainel = 0;
  const app = await criarAplicacaoPainel({
    controlador,
    token: "token-de-teste",
    obterPortaPainel: () => portaPainel,
    encerrarProcesso: () => {},
    sinalEncerramento: sinal.signal,
  });
  const servidor = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    (requisicao) => app.fetch(requisicao),
  );
  portaPainel = servidor.addr.port;
  let portaApi = 0;
  try {
    await teste({
      origem: `http://127.0.0.1:${portaPainel}`,
      controlador,
      portaApi: () => {
        if (portaApi === 0) {
          portaApi = obterPortaLivre();
        }
        return portaApi;
      },
    });
  } finally {
    if (controlador.obterEstado().status === "em_execucao") {
      await controlador.parar();
    }
    sinal.abort();
    await servidor.shutdown();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
}

function conferirCabecalhosSeguranca(resposta: Response): void {
  for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA_ESPERADOS)) {
    assertEquals(resposta.headers.get(nome), valor, nome);
  }
  assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), null);
}

function contar(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1;
}

Deno.test("a página traz o cartão de usuários logados acessível e sem nada inline", async () => {
  await comPainel(async ({ origem }) => {
    const resposta = await fetch(`${origem}/`);
    assertEquals(resposta.status, 200);
    conferirCabecalhosSeguranca(resposta);
    const html = await resposta.text();
    for (
      const trecho of [
        'id="cartao-logados"',
        'id="titulo-logados">Usuários logados</h2>',
        'id="contador-logados"',
        'id="estado-logados" aria-live="polite"',
        'id="mensagem-logados"',
        'id="aviso-logados" hidden',
        'id="area-tabela-logados"',
        'id="corpo-logados"',
        "<caption",
        "Usuários com sessão ativa no servidor</caption>",
        '<th scope="col">Nome</th>',
        '<th scope="col">E-mail</th>',
        '<th scope="col">Tipo</th>',
        '<th scope="col">Sessões</th>',
        '<th scope="col">Logado desde</th>',
        '<script type="module" src="/painel.js"></script>',
      ]
    ) {
      assertStringIncludes(html, trecho);
    }
    assertEquals(contar(html, 'scope="col"'), 5);
    assert(/id="contador-logados"\s+aria-live="polite"/.test(html));
    assert(/role="region"[^>]*tabindex="0"[^>]*hidden/.test(html));
    assertEquals(contar(html, "<script"), 1);
    assertEquals(/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), false);
    assertEquals(/<style/i.test(html), false);
    assertEquals(/\sstyle\s*=/i.test(html), false);
    assertEquals(/\son[a-z]+\s*=/i.test(html), false);
  });
});

Deno.test("os arquivos do painel são servidos com o tipo correto e os mesmos cabeçalhos", async () => {
  await comPainel(async ({ origem }) => {
    const esperados: [string, string, string][] = [
      ["/painel.js", "text/javascript; charset=utf-8", "./logados-cartao.js"],
      [
        "/logados-cartao.js",
        "text/javascript; charset=utf-8",
        "./logados-visao.js",
      ],
      [
        "/logados-visao.js",
        "text/javascript; charset=utf-8",
        "interpretarEventoLogados",
      ],
      ["/painel.css", "text/css; charset=utf-8", ".tabela-logados"],
      ["/favicon.svg", "image/svg+xml", "<svg"],
    ];
    for (const [caminho, tipo, trecho] of esperados) {
      const resposta = await fetch(`${origem}${caminho}`);
      assertEquals(resposta.status, 200, caminho);
      assertEquals(resposta.headers.get("Content-Type"), tipo, caminho);
      conferirCabecalhosSeguranca(resposta);
      assertStringIncludes(await resposta.text(), trecho);
    }
    for (
      const caminho of [
        "/index.html",
        "/publico/painel.js",
        "/aplicacao-painel.ts",
        "/logados-painel.ts",
        "/logados-visao.ts",
        "/outro.js",
        "/painel.js.map",
        "/%2e%2e/deno.json",
      ]
    ) {
      const resposta = await fetch(`${origem}${caminho}`);
      assertEquals(resposta.status, 404, caminho);
      await resposta.body?.cancel();
    }
  });
});

Deno.test("varredura estática: nenhum HTML dinâmico, eval nem estilo ou handler inline nos arquivos do painel", async () => {
  const proibidos: [string, RegExp][] = [
    ["innerHTML", /innerHTML/],
    ["outerHTML", /outerHTML/],
    ["insertAdjacentHTML", /insertAdjacentHTML/],
    ["document.write", /document\s*\.\s*write/],
    ["eval", /\beval\s*\(/],
    ["new Function", /new\s+Function\b/],
    ["setAttribute style", /setAttribute\(\s*["']style["']/],
    ["setAttribute on*", /setAttribute\(\s*["']on/i],
    ["propriedade on*", /\.on[a-z]+\s*=/],
    ["atributo style", /\.style\s*[.=[]/],
    ["setTimeout com texto", /setTimeout\(\s*["'`]/],
  ];
  const arquivos: string[] = [];
  for await (const entrada of Deno.readDir(PUBLICO)) {
    if (/\.(js|html|css)$/.test(entrada.name)) {
      arquivos.push(entrada.name);
    }
  }
  assertEquals(arquivos.sort(), [
    "index.html",
    "logados-cartao.js",
    "logados-visao.js",
    "painel.css",
    "painel.js",
  ]);
  for (const arquivo of arquivos) {
    const conteudo = await Deno.readTextFile(new URL(arquivo, PUBLICO));
    for (const [nome, padrao] of proibidos) {
      assertEquals(padrao.test(conteudo), false, `${arquivo}: ${nome}`);
    }
  }
  const visao = await Deno.readTextFile(new URL("logados-visao.js", PUBLICO));
  assertEquals(/\bdocument\b|\bwindow\b/.test(visao), false);
});

Deno.test("integração: eventos reais do SSE produzem contador 1 e depois 0", async () => {
  await comPainel(async ({ origem, controlador, portaApi }) => {
    const resultado = await controlador.iniciar(portaApi());
    assertEquals(resultado.ok, true, resultado.mensagem);
    const api = `http://127.0.0.1:${portaApi()}/api/v1`;

    const pagina = await fetch(`${origem}/`);
    assertEquals(pagina.status, 200);
    await pagina.body?.cancel();

    const resposta = await fetch(`${origem}/eventos`);
    const cliente = lerFluxoSse(resposta);
    try {
      const contadores = () =>
        cliente.eventos
          .filter((e) => e.evento === "logados")
          .map((e) => {
            const logados = interpretarEventoLogados(e.dados);
            assert(logados !== null, "evento logados aceito pelo módulo");
            return decidirExibicao(logados, true, true).contador;
          });
      await cliente.esperar(() => contadores().length === 1, "inicial");
      assertEquals(contadores(), ["Nenhum usuário logado"]);

      const cadastro = await fetch(`${api}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: "<b>Ana</b>",
          email: "ana@exemplo.com",
          senha: "senha123",
        }),
      });
      assertEquals(cadastro.status, 201);
      await cadastro.body?.cancel();
      const login = await fetch(`${api}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ana@exemplo.com", senha: "senha123" }),
      });
      assertEquals(login.status, 201);
      const sessao = await login.json();
      await cliente.esperar(
        () => contadores().at(-1) === "1 usuário logado",
        "contador 1",
      );
      const ultimo = cliente.eventos.filter((e) => e.evento === "logados")
        .at(-1);
      const exibicao = decidirExibicao(
        interpretarEventoLogados(ultimo?.dados),
        true,
        true,
      );
      assertEquals(exibicao.modo, "lista");
      assertEquals(exibicao.linhas[0].nome, "<b>Ana</b>");
      assertEquals(exibicao.linhas[0].tipo, "Comum");

      const logout = await fetch(`${api}/sessions/${sessao.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessao.token}` },
      });
      assertEquals(logout.status, 204);
      await logout.body?.cancel();
      await cliente.esperar(
        () => contadores().at(-1) === "Nenhum usuário logado",
        "contador 0",
      );
      assertEquals(contadores()[0], "Nenhum usuário logado");
      assert(contadores().includes("1 usuário logado"));
    } finally {
      await cliente.fechar();
    }
  });
});
