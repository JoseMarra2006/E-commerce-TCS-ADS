import { assertEquals } from "@std/assert";
import {
  bytesParaHexadecimal,
  hexadecimalParaBytes,
} from "../src/utilitarios/hexadecimal.ts";

Deno.test("ida e volta com bytes aleatórios preserva os bytes", () => {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  assertEquals(hexadecimalParaBytes(bytesParaHexadecimal(bytes)), bytes);
});

Deno.test("bytesParaHexadecimal usa minúsculas com 2 caracteres por byte", () => {
  assertEquals(
    bytesParaHexadecimal(new Uint8Array([0, 15, 16, 255])),
    "000f10ff",
  );
});

Deno.test("hexadecimalParaBytes aceita maiúsculas e minúsculas", () => {
  assertEquals(
    hexadecimalParaBytes("000F10ff"),
    new Uint8Array([0, 15, 16, 255]),
  );
});

Deno.test("hexadecimalParaBytes com texto vazio retorna array vazio", () => {
  assertEquals(hexadecimalParaBytes(""), new Uint8Array(0));
});

Deno.test("hexadecimalParaBytes retorna null para entradas inválidas", () => {
  for (const texto of ["abc", "zz", "0g", " 00", "00 "]) {
    assertEquals(hexadecimalParaBytes(texto), null);
  }
});
