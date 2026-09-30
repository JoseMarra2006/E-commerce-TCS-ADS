import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { mascararCorpoParaRegistro } from "../src/utilitarios/mascarar.ts";

Deno.test("mascararCorpoParaRegistro retorna null para null", () => {
  assertEquals(mascararCorpoParaRegistro(null), null);
});

Deno.test("mascararCorpoParaRegistro retorna null para texto vazio", () => {
  assertEquals(mascararCorpoParaRegistro(""), null);
});

Deno.test("mascararCorpoParaRegistro mascara senha no nível raiz", () => {
  const resultado = mascararCorpoParaRegistro(
    JSON.stringify({ email: "a@a.com", senha: "12345" }),
  );
  assertEquals(JSON.parse(resultado as string), {
    email: "a@a.com",
    senha: "***",
  });
});

Deno.test("mascararCorpoParaRegistro mascara senha em objetos aninhados", () => {
  const resultado = mascararCorpoParaRegistro(
    JSON.stringify({ usuario: { nome: "ana", senha: "12345" } }),
  );
  assertEquals(JSON.parse(resultado as string), {
    usuario: { nome: "ana", senha: "***" },
  });
});

Deno.test("mascararCorpoParaRegistro mascara senha em arrays", () => {
  const resultado = mascararCorpoParaRegistro(
    JSON.stringify([{ senha: "abc" }, { senha: "def" }]),
  );
  assertEquals(JSON.parse(resultado as string), [
    { senha: "***" },
    { senha: "***" },
  ]);
});

Deno.test("mascararCorpoParaRegistro trunca token em 8 caracteres", () => {
  const resultado = mascararCorpoParaRegistro(
    JSON.stringify({ token: "abcdefghijklmnop" }),
  );
  assertEquals(JSON.parse(resultado as string), { token: "abcdefgh..." });
});

Deno.test("mascararCorpoParaRegistro mascara token não textual", () => {
  const resultado = mascararCorpoParaRegistro(
    JSON.stringify({ token: 12345 }),
  );
  assertEquals(JSON.parse(resultado as string), { token: "***" });
});

Deno.test("mascararCorpoParaRegistro mascara campos sensíveis em JSON inválido", () => {
  const resultado = mascararCorpoParaRegistro('{"senha":"abc", "outro":1');
  assertStringIncludes(resultado as string, '"senha": "***"');
});

Deno.test("mascararCorpoParaRegistro trunca textos maiores que 5000 caracteres", () => {
  const textoGrande = JSON.stringify({ dado: "a".repeat(6000) });
  const resultado = mascararCorpoParaRegistro(textoGrande) as string;
  assertEquals(resultado.length, 5000 + " (truncado)".length);
  assertStringIncludes(resultado, "(truncado)");
});

Deno.test("mascararCorpoParaRegistro não falha com JSON muito aninhado e ainda mascara a senha", () => {
  const profundo = "[".repeat(5000) + "]".repeat(5000);
  const resultado = mascararCorpoParaRegistro(
    `{"senha":"segredo123","aninhado":${profundo}}`,
  );
  assert(resultado !== null);
  assertEquals(resultado.includes("segredo123"), false);
  assert(resultado.includes('"senha": "***"'));
  assert(mascararCorpoParaRegistro(profundo) !== null);
});
