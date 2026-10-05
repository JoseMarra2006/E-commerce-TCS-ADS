import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { criarAplicacaoIntermediario } from "../src/aplicacao-intermediario.ts";
import type { ModoIntermediario } from "../src/aplicacao-intermediario.ts";
import { DIRETORIO_FIXTURES, iniciarServidorFalso, pedidoValido } from "./auxiliares.ts";

const TOKEN = "token-de-teste-1234567890";
const PORTA = 45678;

function criarApp(modo: ModoIntermediario) {
  return criarAplicacaoIntermediario({
    token: TOKEN,
    obterPorta: () => PORTA,
    modo,
    diretorioInterface: modo === "producao" ? DIRETORIO_FIXTURES : undefined,
  });
}

function cabecalhosEnvio(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Host: `127.0.0.1:${PORTA}`,
    Origin: `http://127.0.0.1:${PORTA}`,
    "X-Token-Intermediario": TOKEN,
    "Content-Type": "application/json",
    ...extra,
  };
}

function enviar(
  app: ReturnType<typeof criarApp>,
  corpo: string,
  cabecalhos: Record<string, string> = cabecalhosEnvio(),
) {
  return app.request("/intermediario/enviar", { method: "POST", headers: cabecalhos, body: corpo });
}

function conferirSeguranca(resposta: Response, modo: ModoIntermediario, interface_: boolean): void {
  assertEquals(resposta.headers.get("x-content-type-options"), "nosniff");
  assertEquals(resposta.headers.get("referrer-policy"), "no-referrer");
  assertEquals(resposta.headers.get("x-frame-options"), "DENY");
  assertEquals(resposta.headers.get("access-control-allow-origin"), null);
  const csp = resposta.headers.get("content-security-policy");
  if (modo === "producao" && interface_) {
    assertStringIncludes(csp ?? "", "default-src 'self'");
    assertStringIncludes(csp ?? "", "frame-ancestors 'none'");
  } else {
    assertEquals(csp, null);
  }
}

for (const modo of ["producao", "desenvolvimento"] as const) {
  Deno.test(`[${modo}] Host incorreto devolve 403 em qualquer rota`, async () => {
    const app = criarApp(modo);
    for (
      const [caminho, metodo] of [
        ["/", "GET"],
        ["/intermediario/token", "GET"],
        ["/intermediario/enviar", "POST"],
        ["/perfil", "GET"],
      ] as const
    ) {
      const resposta = await app.request(caminho, {
        method: metodo,
        headers: { Host: "site-malicioso.com" },
      });
      assertEquals(resposta.status, 403, caminho);
      assertEquals(await resposta.text(), "Acesso negado.");
      assertEquals(resposta.headers.get("access-control-allow-origin"), null);
    }
    const semPorta = await app.request("/intermediario/token", { headers: { Host: "127.0.0.1" } });
    assertEquals(semPorta.status, 403);
  });

  Deno.test(`[${modo}] token é entregue com no-store`, async () => {
    const app = criarApp(modo);
    const resposta = await app.request("/intermediario/token", {
      headers: { Host: `localhost:${PORTA}` },
    });
    assertEquals(resposta.status, 200);
    assertEquals(resposta.headers.get("cache-control"), "no-store");
    assertEquals(await resposta.json(), { token: TOKEN });
    conferirSeguranca(resposta, modo, false);
  });

  Deno.test(`[${modo}] envio recusa token ausente, errado e origem inválida`, async () => {
    const app = criarApp(modo);
    const corpo = JSON.stringify(pedidoValido());
    const semToken = cabecalhosEnvio();
    delete semToken["X-Token-Intermediario"];
    const semOrigem = cabecalhosEnvio();
    delete semOrigem["Origin"];
    const casos = [
      semToken,
      cabecalhosEnvio({ "X-Token-Intermediario": "errado" }),
      semOrigem,
      cabecalhosEnvio({ Origin: "http://site-malicioso.com" }),
      cabecalhosEnvio({ Origin: `http://127.0.0.1:${PORTA + 1}` }),
    ];
    for (const cabecalhos of casos) {
      const resposta = await enviar(app, corpo, cabecalhos);
      assertEquals(resposta.status, 403);
      assertEquals(await resposta.json(), { mensagem: "Acesso negado." });
      conferirSeguranca(resposta, modo, false);
    }
  });

  Deno.test(`[${modo}] envio recusa pedido inválido e JSON inválido com 400`, async () => {
    const app = criarApp(modo);
    const invalido = await enviar(app, JSON.stringify(pedidoValido({ porta: 0 })));
    assertEquals(invalido.status, 400);
    const corpoInvalido = await invalido.json();
    assertEquals(
      corpoInvalido.mensagem,
      "O campo porta do pedido deve ser um inteiro entre 1 e 65535.",
    );

    for (const texto of ["{nao e json", "", "[]", "null"]) {
      const resposta = await enviar(app, texto);
      assertEquals(resposta.status, 400, texto);
      assertEquals(typeof (await resposta.json()).mensagem, "string");
    }
  });

  Deno.test(`[${modo}] envio válido é encaminhado e devolve o resultado`, async () => {
    const servidor = iniciarServidorFalso(() =>
      new Response('{"id":1,"nome":"Ana","email":"a@b.co"}', {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      const app = criarApp(modo);
      const resposta = await enviar(
        app,
        JSON.stringify(pedidoValido({ porta: servidor.porta, corpo: '{"x":1}' })),
      );
      assertEquals(resposta.status, 200);
      assertEquals(resposta.headers.get("cache-control"), "no-store");
      const resultado = await resposta.json();
      assertEquals(resultado.tipo, "resposta");
      assertEquals(resultado.status, 201);
      assertEquals(resultado.corpo, '{"id":1,"nome":"Ana","email":"a@b.co"}');
      assertEquals(resultado.url, `http://127.0.0.1:${servidor.porta}/api/v1/users`);
      assertEquals(resultado.cabecalhos["content-type"], "application/json");
      assert(typeof resultado.duracaoMs === "number");
      conferirSeguranca(resposta, modo, false);
    } finally {
      await servidor.encerrar();
    }
  });

  Deno.test(`[${modo}] rota desconhecida do intermediário devolve 404 JSON`, async () => {
    const app = criarApp(modo);
    for (const caminho of ["/intermediario/desconhecido", "/intermediario"]) {
      const resposta = await app.request(caminho, { headers: { Host: `127.0.0.1:${PORTA}` } });
      assertEquals(resposta.status, 404);
      assertEquals(await resposta.json(), { mensagem: "Recurso não encontrado." });
      conferirSeguranca(resposta, modo, false);
    }
  });
}

Deno.test("produção serve a interface com CSP e recusa outros métodos", async () => {
  const app = criarApp("producao");
  const cabecalhos = { Host: `127.0.0.1:${PORTA}` };
  for (const caminho of ["/", "/perfil"]) {
    const resposta = await app.request(caminho, { headers: cabecalhos });
    assertEquals(resposta.status, 200);
    assertStringIncludes(await resposta.clone().text(), 'id="raiz"');
    conferirSeguranca(resposta, "producao", true);
  }
  const arquivo = await app.request("/assets/app.js", { headers: cabecalhos });
  assertEquals(arquivo.status, 200);
  conferirSeguranca(arquivo, "producao", true);
  await arquivo.body?.cancel();

  const post = await app.request("/perfil", { method: "POST", headers: cabecalhos });
  assertEquals(post.status, 405);
  conferirSeguranca(post, "producao", true);
});

Deno.test("desenvolvimento não serve a interface", async () => {
  const app = criarApp("desenvolvimento");
  const resposta = await app.request("/", { headers: { Host: `127.0.0.1:${PORTA}` } });
  assertEquals(resposta.status, 404);
  conferirSeguranca(resposta, "desenvolvimento", false);
});

Deno.test("desenvolvimento aceita Host e Origin da porta 5173; produção recusa", async () => {
  const corpo = JSON.stringify(pedidoValido({ porta: 0 }));
  const cabecalhosVite = cabecalhosEnvio({
    Host: "localhost:5173",
    Origin: "http://localhost:5173",
  });

  const desenvolvimento = await enviar(criarApp("desenvolvimento"), corpo, cabecalhosVite);
  assertEquals(desenvolvimento.status, 400);
  await desenvolvimento.body?.cancel();

  const producao = await enviar(criarApp("producao"), corpo, cabecalhosVite);
  assertEquals(producao.status, 403);
  await producao.body?.cancel();

  const tokenVite = await criarApp("producao").request("/intermediario/token", {
    headers: { Host: "127.0.0.1:5173" },
  });
  assertEquals(tokenVite.status, 403);
  assertFalse(tokenVite.headers.has("access-control-allow-origin"));
  await tokenVite.body?.cancel();
});
