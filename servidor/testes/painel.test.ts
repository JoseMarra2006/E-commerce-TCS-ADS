import { assertEquals, assertStringIncludes } from "@std/assert";
import { criarAplicacaoPainel } from "../src/painel/aplicacao-painel.ts";
import { ControladorServidor } from "../src/controlador-servidor.ts";

const PORTA_PAINEL = 4321;
const TOKEN = "token-de-teste-1234567890abcdef";

async function criarAppDeTeste() {
  const controlador = new ControladorServidor();
  const app = await criarAplicacaoPainel({
    controlador,
    token: TOKEN,
    obterPortaPainel: () => PORTA_PAINEL,
    encerrarProcesso: () => {},
    sinalEncerramento: new AbortController().signal,
  });
  return app;
}

Deno.test("GET / com Host correto retorna a página com o token", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/", {
    headers: { Host: `127.0.0.1:${PORTA_PAINEL}` },
  });

  assertEquals(resposta.status, 200);
  const texto = await resposta.text();
  assertStringIncludes(texto, TOKEN);
  assertEquals(texto.includes("{{TOKEN_PAINEL}}"), false);
  assertStringIncludes(
    resposta.headers.get("Content-Security-Policy") ?? "",
    "default-src 'self'",
  );
});

Deno.test("qualquer rota com Host de outro domínio retorna 403", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/", {
    headers: { Host: "exemplo-malicioso.com" },
  });

  assertEquals(resposta.status, 403);
});

Deno.test("POST /acoes/iniciar sem token retorna 403", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/acoes/iniciar", {
    method: "POST",
    headers: {
      Host: `127.0.0.1:${PORTA_PAINEL}`,
      Origin: `http://127.0.0.1:${PORTA_PAINEL}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ porta: "20000" }),
  });

  assertEquals(resposta.status, 403);
});

Deno.test("POST /acoes/iniciar com token errado retorna 403", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/acoes/iniciar", {
    method: "POST",
    headers: {
      Host: `127.0.0.1:${PORTA_PAINEL}`,
      Origin: `http://127.0.0.1:${PORTA_PAINEL}`,
      "Content-Type": "application/json",
      "X-Token-Painel": "token-errado",
    },
    body: JSON.stringify({ porta: "20000" }),
  });

  assertEquals(resposta.status, 403);
});

Deno.test("POST /acoes/iniciar com Origin diferente retorna 403", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/acoes/iniciar", {
    method: "POST",
    headers: {
      Host: `127.0.0.1:${PORTA_PAINEL}`,
      Origin: "http://outro-site.com",
      "Content-Type": "application/json",
      "X-Token-Painel": TOKEN,
    },
    body: JSON.stringify({ porta: "20000" }),
  });

  assertEquals(resposta.status, 403);
});

Deno.test("nenhuma resposta do painel contém cabeçalhos CORS", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/", {
    headers: { Host: `127.0.0.1:${PORTA_PAINEL}` },
  });

  assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("POST /acoes/iniciar com credenciais corretas e porta inválida retorna mensagem de validação", async () => {
  const app = await criarAppDeTeste();

  const resposta = await app.request("/acoes/iniciar", {
    method: "POST",
    headers: {
      Host: `127.0.0.1:${PORTA_PAINEL}`,
      Origin: `http://127.0.0.1:${PORTA_PAINEL}`,
      "Content-Type": "application/json",
      "X-Token-Painel": TOKEN,
    },
    body: JSON.stringify({ porta: "abc" }),
  });

  assertEquals(resposta.status, 200);
  const corpo = await resposta.json();
  assertEquals(corpo, {
    ok: false,
    mensagem: "A porta deve conter apenas números.",
  });
});
