import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { registrarMetodosNaoPermitidos } from "../src/intermediarios/metodo-nao-permitido.ts";
import { criarRespostaJson } from "../src/utilitarios/respostas-sucesso.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

function conferirCors(headers: Headers) {
  assertEquals(headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
}

async function conferir405(resposta: Response, allow: string) {
  assertEquals(resposta.status, 405);
  assertEquals(await resposta.json(), {
    mensagem: "Método não permitido nesta rota.",
  });
  assertEquals(
    resposta.headers.get("Content-Type"),
    "application/json; charset=utf-8",
  );
  assertEquals(resposta.headers.get("Allow"), allow);
  conferirCors(resposta.headers);
}

async function comApp(
  teste: (app: ReturnType<typeof criarAplicacao>) => Promise<void>,
) {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    app.get(
      "/api/v1/teste-rota",
      () => criarRespostaJson(200, { rota: "get" }),
    );
    app.post(
      "/api/v1/teste-rota",
      () => criarRespostaJson(201, { rota: "post" }),
    );
    registrarMetodosNaoPermitidos(app, "/api/v1/teste-rota", ["GET", "POST"]);
    app.delete(
      "/api/v1/teste-rota/:id",
      () => criarRespostaJson(200, { rota: "delete" }),
    );
    registrarMetodosNaoPermitidos(app, "/api/v1/teste-rota/:id", ["DELETE"]);
    await teste(app);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

Deno.test("GET e POST permitidos respondem pelas rotas de teste", async () => {
  await comApp(async (app) => {
    const get = await app.request("/api/v1/teste-rota");
    assertEquals(get.status, 200);
    assertEquals(await get.json(), { rota: "get" });
    const post = await app.request("/api/v1/teste-rota", { method: "POST" });
    assertEquals(post.status, 201);
    assertEquals(await post.json(), { rota: "post" });
  });
});

Deno.test("métodos não permitidos retornam 405 com Allow e CORS", async () => {
  await comApp(async (app) => {
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      const resposta = await app.request("/api/v1/teste-rota", {
        method: metodo,
      });
      await conferir405(resposta, "GET, HEAD, POST, OPTIONS");
    }
  });
});

Deno.test("405 também vale com barra final", async () => {
  await comApp(async (app) => {
    const resposta = await app.request("/api/v1/teste-rota/", {
      method: "PUT",
    });
    await conferir405(resposta, "GET, HEAD, POST, OPTIONS");
  });
});

Deno.test("rota com parâmetro responde 405 fora do DELETE", async () => {
  await comApp(async (app) => {
    for (const metodo of ["GET", "PUT", "POST"]) {
      const resposta = await app.request("/api/v1/teste-rota/abc", {
        method: metodo,
      });
      await conferir405(resposta, "DELETE, OPTIONS");
    }
    const excluir = await app.request("/api/v1/teste-rota/abc", {
      method: "DELETE",
    });
    assertEquals(excluir.status, 200);
    assertEquals(await excluir.json(), { rota: "delete" });
  });
});

Deno.test("OPTIONS nunca retorna 405", async () => {
  await comApp(async (app) => {
    for (const caminho of ["/api/v1/teste-rota", "/api/v1/teste-rota/abc"]) {
      const resposta = await app.request(caminho, { method: "OPTIONS" });
      assertEquals(resposta.status, 204);
      conferirCors(resposta.headers);
    }
  });
});

Deno.test("caminho desconhecido continua retornando 404", async () => {
  await comApp(async (app) => {
    for (const metodo of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const resposta = await app.request("/api/v1/outra-coisa", {
        method: metodo,
      });
      assertEquals(resposta.status, 404);
      assertEquals(await resposta.json(), { mensagem: "Rota não encontrada." });
    }
  });
});

Deno.test("HEAD é atendido pela rota GET e não retorna 405", async () => {
  await comApp(async (app) => {
    const resposta = await app.request("/api/v1/teste-rota", {
      method: "HEAD",
    });
    assertEquals(resposta.status, 200);
    assertEquals(await resposta.text(), "");
  });
});

Deno.test("resposta de criarRespostaJson recebe CORS dentro da aplicação", async () => {
  await comApp(async (app) => {
    const resposta = await app.request("/api/v1/teste-rota");
    assertEquals(resposta.status, 200);
    conferirCors(resposta.headers);
    await resposta.json();
  });
});
