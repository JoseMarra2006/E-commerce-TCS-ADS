import { assertEquals } from "@std/assert";
import { validarPorta } from "../src/utilitarios/validar-porta.ts";

Deno.test("validarPorta rejeita texto vazio", () => {
  const resultado = validarPorta("");
  assertEquals(resultado, { ok: false, mensagem: "Informe a porta." });
});

Deno.test("validarPorta rejeita apenas espaços", () => {
  const resultado = validarPorta("   ");
  assertEquals(resultado, { ok: false, mensagem: "Informe a porta." });
});

Deno.test("validarPorta rejeita letras", () => {
  const resultado = validarPorta("abc");
  assertEquals(resultado, {
    ok: false,
    mensagem: "A porta deve conter apenas números.",
  });
});

Deno.test("validarPorta rejeita número negativo", () => {
  const resultado = validarPorta("-1");
  assertEquals(resultado, {
    ok: false,
    mensagem: "A porta deve conter apenas números.",
  });
});

Deno.test("validarPorta rejeita zero", () => {
  const resultado = validarPorta("0");
  assertEquals(resultado, {
    ok: false,
    mensagem: "A porta deve estar entre 1 e 65535.",
  });
});

Deno.test("validarPorta aceita 1", () => {
  const resultado = validarPorta("1");
  assertEquals(resultado, { ok: true, porta: 1 });
});

Deno.test("validarPorta aceita 20000", () => {
  const resultado = validarPorta("20000");
  assertEquals(resultado, { ok: true, porta: 20000 });
});

Deno.test("validarPorta aceita 65535", () => {
  const resultado = validarPorta("65535");
  assertEquals(resultado, { ok: true, porta: 65535 });
});

Deno.test("validarPorta rejeita 65536", () => {
  const resultado = validarPorta("65536");
  assertEquals(resultado, {
    ok: false,
    mensagem: "A porta deve estar entre 1 e 65535.",
  });
});

Deno.test("validarPorta aceita número com espaços ao redor", () => {
  const resultado = validarPorta(" 20000 ");
  assertEquals(resultado, { ok: true, porta: 20000 });
});
