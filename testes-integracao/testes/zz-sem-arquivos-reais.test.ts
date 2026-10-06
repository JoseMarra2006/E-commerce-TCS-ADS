import { assertEquals } from "@std/assert";
import {
  encontrarArquivosReaisAlterados,
  removerRegistroInicial,
} from "../../servidor/testes/auxiliares/vigia-arquivos-reais.ts";

Deno.test("os testes de integração não criam nem modificam o banco e o segredo reais", () => {
  const problemas = encontrarArquivosReaisAlterados();
  removerRegistroInicial();
  assertEquals(
    problemas,
    [],
    `Testes usaram arquivos reais de servidor/dados: ${problemas.join("; ")}.`,
  );
});
