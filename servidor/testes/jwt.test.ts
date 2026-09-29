import { assertEquals } from "@std/assert";
import { sign } from "@hono/hono/jwt";
import { gerarTokenJwt, verificarTokenJwt } from "../src/utilitarios/jwt.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

const codificador = new TextEncoder();

function paraBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodificarParte(parte: string): Record<string, unknown> {
  const base64 = parte.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
}

function agora(): number {
  return Math.floor(Date.now() / 1000);
}

function assinarHs256(payload: Record<string, unknown>): Promise<string> {
  return sign(payload, SEGREDO_TESTE, "HS256");
}

Deno.test("gerar e verificar retorna os dados originais", async () => {
  const token = await gerarTokenJwt(
    { usuarioId: 42, sessaoId: "sessao-abc" },
    SEGREDO_TESTE,
  );
  assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), {
    ok: true,
    usuarioId: 42,
    sessaoId: "sessao-abc",
  });
});

Deno.test("payload tem somente sub, sid e iat e cabeçalho HS256", async () => {
  const token = await gerarTokenJwt(
    { usuarioId: 7, sessaoId: "s1" },
    SEGREDO_TESTE,
  );
  const [cabecalho, payload] = token.split(".");
  assertEquals(decodificarParte(cabecalho).alg, "HS256");
  const dados = decodificarParte(payload);
  assertEquals(Object.keys(dados).sort(), ["iat", "sid", "sub"]);
  assertEquals(dados.sub, "7");
  assertEquals(typeof dados.iat, "number");
});

Deno.test("segredo diferente é recusado", async () => {
  const token = await gerarTokenJwt(
    { usuarioId: 1, sessaoId: "s" },
    SEGREDO_TESTE,
  );
  assertEquals(await verificarTokenJwt(token, "b".repeat(128)), { ok: false });
});

Deno.test("payload adulterado é recusado", async () => {
  const original = await gerarTokenJwt(
    { usuarioId: 1, sessaoId: "s" },
    SEGREDO_TESTE,
  );
  const outro = await gerarTokenJwt(
    { usuarioId: 2, sessaoId: "s" },
    SEGREDO_TESTE,
  );
  const partes = original.split(".");
  partes[1] = outro.split(".")[1];
  assertEquals(await verificarTokenJwt(partes.join("."), SEGREDO_TESTE), {
    ok: false,
  });
});

Deno.test("assinatura adulterada é recusada", async () => {
  const token = await gerarTokenJwt(
    { usuarioId: 1, sessaoId: "s" },
    SEGREDO_TESTE,
  );
  const partes = token.split(".");
  const ultimo = partes[2].slice(0, 1);
  partes[2] = (ultimo === "A" ? "B" : "A") + partes[2].slice(1);
  assertEquals(await verificarTokenJwt(partes.join("."), SEGREDO_TESTE), {
    ok: false,
  });
});

Deno.test("alg none é recusado", async () => {
  const cabecalho = paraBase64Url(
    codificador.encode(JSON.stringify({ alg: "none", typ: "JWT" })),
  );
  const payload = paraBase64Url(
    codificador.encode(JSON.stringify({ sub: "1", sid: "s", iat: agora() })),
  );
  assertEquals(
    await verificarTokenJwt(`${cabecalho}.${payload}.`, SEGREDO_TESTE),
    { ok: false },
  );
});

Deno.test("HS512 com o mesmo segredo é recusado", async () => {
  const token = await sign(
    { sub: "1", sid: "s", iat: agora() },
    SEGREDO_TESTE,
    "HS512",
  );
  assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), { ok: false });
});

Deno.test("textos malformados são recusados", async () => {
  const naoJson = paraBase64Url(codificador.encode("isto nao e json"));
  const casos = [
    "",
    "abc",
    "a.b",
    "a.b.c.d",
    "@@@.e30.assinatura",
    `${naoJson}.e30.assinatura`,
  ];
  for (const caso of casos) {
    assertEquals(await verificarTokenJwt(caso, SEGREDO_TESTE), { ok: false });
  }
});

const PAYLOADS_INVALIDOS: [string, Record<string, unknown>][] = [
  ["sem sub", { sid: "s" }],
  ["sub numérico", { sub: 1, sid: "s" }],
  ["sub abc", { sub: "abc", sid: "s" }],
  ["sub zero", { sub: "0", sid: "s" }],
  ["sub negativo", { sub: "-1", sid: "s" }],
  ["sub fora do intervalo seguro", { sub: "9".repeat(20), sid: "s" }],
  ["sem sid", { sub: "1" }],
  ["sid numérico", { sub: "1", sid: 5 }],
  ["sid vazio", { sub: "1", sid: "" }],
  ["sid com 101 caracteres", { sub: "1", sid: "x".repeat(101) }],
];

for (const [descricao, payload] of PAYLOADS_INVALIDOS) {
  Deno.test(`payload inválido (${descricao}) é recusado`, async () => {
    const token = await assinarHs256({ ...payload, iat: agora() });
    assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), { ok: false });
  });
}

Deno.test("sid com 100 caracteres é aceito", async () => {
  const token = await assinarHs256({
    sub: "1",
    sid: "x".repeat(100),
    iat: agora(),
  });
  assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), {
    ok: true,
    usuarioId: 1,
    sessaoId: "x".repeat(100),
  });
});

Deno.test("token com exp no passado é recusado", async () => {
  const token = await assinarHs256({
    sub: "1",
    sid: "s",
    iat: agora() - 100,
    exp: agora() - 10,
  });
  assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), { ok: false });
});

Deno.test("token com iat no futuro é recusado", async () => {
  const token = await assinarHs256({ sub: "1", sid: "s", iat: agora() + 1000 });
  assertEquals(await verificarTokenJwt(token, SEGREDO_TESTE), { ok: false });
});
