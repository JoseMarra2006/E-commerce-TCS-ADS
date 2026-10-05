import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { validarPedidoEnvio } from "../src/pedido-envio.ts";
import { pedidoValido } from "./auxiliares.ts";

function assertRecusa(dados: unknown, trecho: string): void {
  const resultado = validarPedidoEnvio(dados);
  assert(!resultado.ok, "o pedido deveria ser recusado");
  assertStringIncludes(resultado.mensagem, trecho);
}

Deno.test("aceita pedido válido e devolve o mesmo conteúdo", () => {
  const resultado = validarPedidoEnvio(pedidoValido({ token: "abc.def", corpo: '{"a":1}' }));
  assert(resultado.ok);
  assertEquals(resultado.pedido, {
    ip: "127.0.0.1",
    porta: 20000,
    metodo: "POST",
    caminho: "/api/v1/users",
    token: "abc.def",
    corpo: '{"a":1}',
  });
});

Deno.test("aceita IPs e nomes de host válidos", () => {
  for (const ip of ["10.20.50.123", "127.0.0.1", "localhost", "pc-do-colega.local"]) {
    assert(validarPedidoEnvio(pedidoValido({ ip })).ok, ip);
  }
});

Deno.test("aceita GET e DELETE sem corpo", () => {
  assert(validarPedidoEnvio(pedidoValido({ metodo: "GET", corpo: null })).ok);
  assert(validarPedidoEnvio(pedidoValido({ metodo: "DELETE", corpo: null })).ok);
});

Deno.test("recusa valores que não são objeto", () => {
  for (const valor of [null, "texto", 12, [], undefined, true]) {
    assertRecusa(valor, "objeto JSON");
  }
});

Deno.test("recusa cada campo ausente", () => {
  for (const campo of ["ip", "porta", "metodo", "caminho", "token", "corpo"]) {
    const dados: Record<string, unknown> = { ...pedidoValido() };
    delete dados[campo];
    assertRecusa(dados, `O campo ${campo} é obrigatório`);
  }
});

Deno.test("recusa campo extra", () => {
  assertRecusa({ ...pedidoValido(), cabecalhos: {} }, "campo não permitido: cabecalhos");
});

Deno.test("recusa ip inválido", () => {
  const rotulo64 = "a".repeat(64);
  const invalidos = [
    "127.0.0.1:80",
    "host/caminho",
    "usuario@host",
    "host com espaco",
    "-host.local",
    "host-.local",
    `${rotulo64}.local`,
    "256.1.1.1",
    "",
    "a..b",
    123,
    null,
  ];
  for (const ip of invalidos) {
    assertRecusa(pedidoValido({ ip }), "campo ip");
  }
});

Deno.test("recusa porta inválida", () => {
  for (const porta of [0, 65536, 1.5, "20000", null, -1]) {
    assertRecusa(
      pedidoValido({ porta }),
      "O campo porta do pedido deve ser um inteiro entre 1 e 65535.",
    );
  }
});

Deno.test("recusa método inválido", () => {
  for (const metodo of ["OPTIONS", "HEAD", "get", 1, null]) {
    assertRecusa(pedidoValido({ metodo }), "campo metodo");
  }
});

Deno.test("recusa caminho inválido", () => {
  const invalidos = [
    "/users",
    "/api/v2/users",
    "/api/v1",
    "/api/v1/../users",
    "/api/v1/users?a=1",
    "/api/v1/users#x",
    "/api/v1/us ers",
    `/api/v1/${"a".repeat(2049)}`,
    "/api/v1/users\\x",
    5,
  ];
  for (const caminho of invalidos) {
    assertRecusa(pedidoValido({ caminho }), "campo caminho");
  }
});

Deno.test("aceita caminho com id e barra final", () => {
  assert(validarPedidoEnvio(pedidoValido({ caminho: "/api/v1/users/12/" })).ok);
  assert(validarPedidoEnvio(pedidoValido({ caminho: "/api/v1/sessions/a-b_c.d~e%20" })).ok);
});

Deno.test("recusa token inválido", () => {
  for (const token of ["", "com espaco", "quebra\nlinha", "tab\taqui", 5, "a".repeat(8193)]) {
    assertRecusa(pedidoValido({ token }), "campo token");
  }
});

Deno.test("recusa corpo acima de 1 MB e aceita exatamente 1 MB", () => {
  assertRecusa(pedidoValido({ corpo: "a".repeat(1024 * 1024 + 1) }), "no máximo 1 MB");
  assert(validarPedidoEnvio(pedidoValido({ corpo: "a".repeat(1024 * 1024) })).ok);
  assertRecusa(pedidoValido({ corpo: "é".repeat(600 * 1024) }), "no máximo 1 MB");
});

Deno.test("recusa corpo não textual", () => {
  assertRecusa(pedidoValido({ corpo: 5 }), "campo corpo");
  assertRecusa(pedidoValido({ corpo: {} }), "campo corpo");
});

Deno.test("recusa corpo em GET e DELETE", () => {
  assertRecusa(pedidoValido({ metodo: "GET", corpo: "{}" }), "GET e DELETE");
  assertRecusa(pedidoValido({ metodo: "DELETE", corpo: "{}" }), "GET e DELETE");
});
