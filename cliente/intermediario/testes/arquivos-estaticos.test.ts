import { assertEquals, assertStringIncludes } from "@std/assert";
import { servirArquivoEstatico } from "../src/arquivos-estaticos.ts";
import { DIRETORIO_FIXTURES } from "./auxiliares.ts";

Deno.test("raiz e index.html devolvem a interface sem cache", async () => {
  for (const caminho of ["/", "/index.html"]) {
    const resposta = await servirArquivoEstatico(DIRETORIO_FIXTURES, caminho);
    assertEquals(resposta.status, 200);
    assertEquals(resposta.headers.get("content-type"), "text/html; charset=utf-8");
    assertEquals(resposta.headers.get("cache-control"), "no-store");
    assertStringIncludes(await resposta.text(), 'id="raiz"');
  }
});

Deno.test("arquivos de assets têm tipo correto e cache longo", async () => {
  const js = await servirArquivoEstatico(DIRETORIO_FIXTURES, "/assets/app.js");
  assertEquals(js.status, 200);
  assertEquals(js.headers.get("content-type"), "text/javascript; charset=utf-8");
  assertEquals(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await js.body?.cancel();

  const css = await servirArquivoEstatico(DIRETORIO_FIXTURES, "/assets/app.css");
  assertEquals(css.status, 200);
  assertEquals(css.headers.get("content-type"), "text/css; charset=utf-8");
  assertEquals(css.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await css.body?.cancel();
});

Deno.test("rotas da interface sem extensão recebem o index.html", async () => {
  for (const caminho of ["/perfil", "/perfil/editar"]) {
    const resposta = await servirArquivoEstatico(DIRETORIO_FIXTURES, caminho);
    assertEquals(resposta.status, 200);
    assertEquals(resposta.headers.get("content-type"), "text/html; charset=utf-8");
    assertStringIncludes(await resposta.text(), 'id="raiz"');
  }
});

Deno.test("arquivo inexistente com extensão devolve 404", async () => {
  const resposta = await servirArquivoEstatico(DIRETORIO_FIXTURES, "/inexistente.js");
  assertEquals(resposta.status, 404);
  await resposta.body?.cancel();
});

Deno.test("tentativas de sair do diretório devolvem 404", async () => {
  const tentativas = [
    "/../deno.json",
    "/assets/../../deno.json",
    "/%2e%2e/deno.json",
    "/..%2fdeno.json",
    "/assets\\..\\..\\deno.json",
    "/%2e%2e%2f%2e%2e%2fdeno.json",
    "/C:/Windows/win.ini",
  ];
  for (const caminho of tentativas) {
    const resposta = await servirArquivoEstatico(DIRETORIO_FIXTURES, caminho);
    assertEquals(resposta.status, 404, caminho);
    const texto = await resposta.text();
    assertEquals(texto.includes("tasks"), false, caminho);
  }
});

Deno.test("caminho mal codificado devolve 400", async () => {
  const resposta = await servirArquivoEstatico(DIRETORIO_FIXTURES, "/%E0%A4%A");
  assertEquals(resposta.status, 400);
  await resposta.body?.cancel();
});
