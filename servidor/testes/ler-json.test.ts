import { assertEquals } from "@std/assert";
import { lerCampoTexto, lerCorpoJson } from "../src/utilitarios/ler-json.ts";

Deno.test("lerCorpoJson rejeita texto vazio", () => {
  const resultado = lerCorpoJson("");
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição é obrigatório.",
  });
});

Deno.test("lerCorpoJson rejeita JSON inválido", () => {
  const resultado = lerCorpoJson("{invalido");
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição não é um JSON válido.",
  });
});

Deno.test("lerCorpoJson rejeita array", () => {
  const resultado = lerCorpoJson("[1,2,3]");
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});

Deno.test("lerCorpoJson rejeita null", () => {
  const resultado = lerCorpoJson("null");
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});

Deno.test("lerCorpoJson rejeita número", () => {
  const resultado = lerCorpoJson("42");
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});

Deno.test("lerCorpoJson rejeita texto simples", () => {
  const resultado = lerCorpoJson('"ola"');
  assertEquals(resultado, {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});

Deno.test("lerCorpoJson aceita objeto válido", () => {
  const resultado = lerCorpoJson('{"nome":"ana"}');
  assertEquals(resultado, { ok: true, dados: { nome: "ana" } });
});

Deno.test("lerCampoTexto retorna erro quando campo obrigatório ausente", () => {
  const resultado = lerCampoTexto({}, "email", true);
  assertEquals(resultado, {
    ok: false,
    mensagem: "O campo email é obrigatório.",
  });
});

Deno.test("lerCampoTexto retorna ausente quando campo opcional não está presente", () => {
  const resultado = lerCampoTexto({}, "apelido", false);
  assertEquals(resultado, { ok: true, presente: false });
});

Deno.test("lerCampoTexto rejeita valor nulo", () => {
  const resultado = lerCampoTexto({ email: null }, "email", true);
  assertEquals(resultado, {
    ok: false,
    mensagem: "O campo email não pode ser nulo.",
  });
});

Deno.test("lerCampoTexto rejeita número", () => {
  const resultado = lerCampoTexto({ email: 123 }, "email", true);
  assertEquals(resultado, {
    ok: false,
    mensagem: "O campo email deve ser um texto.",
  });
});

Deno.test("lerCampoTexto rejeita booleano", () => {
  const resultado = lerCampoTexto({ email: true }, "email", true);
  assertEquals(resultado, {
    ok: false,
    mensagem: "O campo email deve ser um texto.",
  });
});

Deno.test("lerCampoTexto rejeita objeto", () => {
  const resultado = lerCampoTexto({ email: {} }, "email", true);
  assertEquals(resultado, {
    ok: false,
    mensagem: "O campo email deve ser um texto.",
  });
});

Deno.test("lerCampoTexto aceita texto válido", () => {
  const resultado = lerCampoTexto({ email: "ana@exemplo.com" }, "email", true);
  assertEquals(resultado, {
    ok: true,
    presente: true,
    valor: "ana@exemplo.com",
  });
});
