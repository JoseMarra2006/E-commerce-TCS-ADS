import { assertEquals } from "@std/assert";
import {
  criarRespostaJson,
  criarRespostaSemConteudo,
} from "../src/utilitarios/respostas-sucesso.ts";

Deno.test("criarRespostaJson define status, Content-Type e corpo", async () => {
  const resposta = criarRespostaJson(201, { a: 1 });
  assertEquals(resposta.status, 201);
  assertEquals(
    resposta.headers.get("Content-Type"),
    "application/json; charset=utf-8",
  );
  assertEquals(await resposta.text(), '{"a":1}');
});

Deno.test("criarRespostaJson aplica cabeçalhos extras", async () => {
  const resposta = criarRespostaJson(201, { a: 1 }, {
    Location: "/api/v1/users/1",
    "Cache-Control": "no-store",
  });
  assertEquals(resposta.headers.get("Location"), "/api/v1/users/1");
  assertEquals(resposta.headers.get("Cache-Control"), "no-store");
  await resposta.body?.cancel();
});

Deno.test("criarRespostaSemConteudo retorna 204 vazio e sem Content-Type", async () => {
  const resposta = criarRespostaSemConteudo();
  assertEquals(resposta.status, 204);
  assertEquals(await resposta.text(), "");
  assertEquals(resposta.headers.get("Content-Type"), null);
});
