import { assertEquals } from "@std/assert";
import { compararEmTempoConstante } from "../src/utilitarios/comparacao-segura.ts";

Deno.test("arrays iguais retornam true", () => {
  assertEquals(
    compararEmTempoConstante(
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([1, 2, 3, 4]),
    ),
    true,
  );
});

Deno.test("um único byte diferente retorna false em qualquer posição", () => {
  const base = [1, 2, 3, 4, 5];
  for (const posicao of [0, 2, 4]) {
    const outro = [...base];
    outro[posicao] = 99;
    assertEquals(
      compararEmTempoConstante(
        new Uint8Array(base),
        new Uint8Array(outro),
      ),
      false,
    );
  }
});

Deno.test("tamanhos diferentes retornam false", () => {
  assertEquals(
    compararEmTempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])),
    false,
  );
});

Deno.test("dois arrays vazios retornam true", () => {
  assertEquals(
    compararEmTempoConstante(new Uint8Array(0), new Uint8Array(0)),
    true,
  );
});
