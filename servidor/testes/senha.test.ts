import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { bytesParaHexadecimal } from "../src/utilitarios/hexadecimal.ts";
import {
  derivarChavePbkdf2,
  executarDerivacaoFicticia,
  gerarHashSenha,
  verificarSenha,
} from "../src/utilitarios/senha.ts";

const codificador = new TextEncoder();

Deno.test("PBKDF2 confere com o vetor oficial 1 da RFC 7914", async () => {
  const resultado = await derivarChavePbkdf2(
    "passwd",
    codificador.encode("salt"),
    1,
    32,
  );
  assertEquals(
    bytesParaHexadecimal(resultado),
    "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc",
  );
});

Deno.test("PBKDF2 confere com o vetor oficial 2 da RFC 7914", async () => {
  const resultado = await derivarChavePbkdf2(
    "Password",
    codificador.encode("NaCl"),
    80000,
    32,
  );
  assertEquals(
    bytesParaHexadecimal(resultado),
    "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56",
  );
});

Deno.test("verificarSenha confere com valor calculado externamente na configuração real", async () => {
  assertEquals(
    await verificarSenha(
      "senha123",
      "2caac44f2062ea92bc94d5b0f9291da53a86466d45c1ae5f17767c24928842f8",
      "00000000000000000000000000000000",
    ),
    true,
  );
});

Deno.test("gerarHashSenha retorna hash e salt hexadecimais minúsculos", async () => {
  const { hash, salt } = await gerarHashSenha("senha123");
  assert(/^[0-9a-f]{64}$/.test(hash));
  assert(/^[0-9a-f]{32}$/.test(salt));
});

Deno.test("verificarSenha aceita a senha correta e rejeita a errada", async () => {
  const { hash, salt } = await gerarHashSenha("senha123");
  assertEquals(await verificarSenha("senha123", hash, salt), true);
  assertEquals(await verificarSenha("outraSenha1", hash, salt), false);
  assertEquals(await verificarSenha("Senha123", hash, salt), false);
});

Deno.test("mesma senha gera salts e hashes diferentes, ambos verificáveis", async () => {
  const primeiro = await gerarHashSenha("senha123");
  const segundo = await gerarHashSenha("senha123");
  assertNotEquals(primeiro.salt, segundo.salt);
  assertNotEquals(primeiro.hash, segundo.hash);
  assertEquals(
    await verificarSenha("senha123", primeiro.hash, primeiro.salt),
    true,
  );
  assertEquals(
    await verificarSenha("senha123", segundo.hash, segundo.salt),
    true,
  );
});

Deno.test("dados corrompidos retornam false sem lançar exceção", async () => {
  const hashValido =
    "2caac44f2062ea92bc94d5b0f9291da53a86466d45c1ae5f17767c24928842f8";
  const saltValido = "00000000000000000000000000000000";
  assertEquals(
    await verificarSenha("senha123", "zz".repeat(32), saltValido),
    false,
  );
  assertEquals(await verificarSenha("senha123", hashValido, "abc"), false);
  assertEquals(await verificarSenha("senha123", "", ""), false);
  assertEquals(
    await verificarSenha("senha123", hashValido, "00".repeat(15)),
    false,
  );
  assertEquals(
    await verificarSenha("senha123", "00".repeat(31), saltValido),
    false,
  );
});

Deno.test("executarDerivacaoFicticia conclui sem lançar exceção", async () => {
  await executarDerivacaoFicticia("qualquer");
});
