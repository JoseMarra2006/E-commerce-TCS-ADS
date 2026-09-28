import { assertEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

function assertCabecalhosCors(headers: Headers) {
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

Deno.test("GET em rota inexistente retorna 404 com CORS", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao });
    const resposta = await app.request("/api/v1/qualquer");
    assertEquals(resposta.status, 404);
    assertEquals(await resposta.json(), { mensagem: "Rota não encontrada." });
    assertEquals(
      resposta.headers.get("Content-Type"),
      "application/json; charset=utf-8",
    );
    assertCabecalhosCors(resposta.headers);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
});

Deno.test("GET em rota inexistente com barra final retorna 404 com CORS", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao });
    const resposta = await app.request("/api/v1/qualquer/");
    assertEquals(resposta.status, 404);
    assertCabecalhosCors(resposta.headers);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
});

for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
  Deno.test(`${metodo} em rota inexistente retorna 404 com CORS`, async () => {
    const caminho = criarCaminhoBancoTemporario();
    const conexao = abrirConexao(caminho);
    try {
      const app = criarAplicacao({ conexao });
      const resposta = await app.request("/api/v1/qualquer", {
        method: metodo,
      });
      assertEquals(resposta.status, 404);
      assertCabecalhosCors(resposta.headers);
    } finally {
      fecharConexao(conexao);
      removerBancoTemporario(caminho);
    }
  });
}

Deno.test("OPTIONS em caminho existente retorna 204 com CORS", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao });
    app.get("/api/v1/existe", (c) => c.json({ ok: true }));

    const resposta = await app.request("/api/v1/existe", { method: "OPTIONS" });
    assertEquals(resposta.status, 204);
    assertEquals(await resposta.text(), "");
    assertCabecalhosCors(resposta.headers);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
});

Deno.test("OPTIONS em caminho inexistente retorna 204 com CORS", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao });
    const resposta = await app.request("/api/v1/nao-existe", {
      method: "OPTIONS",
    });
    assertEquals(resposta.status, 204);
    assertEquals(await resposta.text(), "");
    assertCabecalhosCors(resposta.headers);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
});

Deno.test("rota que lança erro retorna 500 com CORS", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    const app = criarAplicacao({ conexao });
    app.get("/api/v1/explode", () => {
      throw new Error("falha proposital");
    });

    const resposta = await app.request("/api/v1/explode");
    assertEquals(resposta.status, 500);
    assertEquals(await resposta.json(), {
      mensagem: "Erro interno no servidor.",
    });
    assertCabecalhosCors(resposta.headers);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
});
