import { assertEquals } from "@std/assert";
import {
  CAMINHO_SESSAO,
  CAMINHO_SESSOES,
  CAMINHO_USUARIO,
  CAMINHO_USUARIOS,
  montarCaminhoSessao,
  montarCaminhoUsuario,
  PREFIXO_API,
} from "../src/utilitarios/caminhos-api.ts";

Deno.test("constantes de caminho têm os valores definidos", () => {
  assertEquals(PREFIXO_API, "/api/v1");
  assertEquals(CAMINHO_USUARIOS, "/api/v1/users");
  assertEquals(CAMINHO_USUARIO, "/api/v1/users/:id");
  assertEquals(CAMINHO_SESSOES, "/api/v1/sessions");
  assertEquals(CAMINHO_SESSAO, "/api/v1/sessions/:id");
});

Deno.test("montarCaminhoUsuario monta o caminho com o id", () => {
  assertEquals(montarCaminhoUsuario(5), "/api/v1/users/5");
});

Deno.test("montarCaminhoSessao monta o caminho e codifica o id", () => {
  const uuid = crypto.randomUUID();
  assertEquals(montarCaminhoSessao(uuid), `/api/v1/sessions/${uuid}`);
  assertEquals(montarCaminhoSessao("a/b c"), "/api/v1/sessions/a%2Fb%20c");
});
