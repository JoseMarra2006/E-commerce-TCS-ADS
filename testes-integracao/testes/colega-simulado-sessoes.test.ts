import { assertNotEquals } from "@std/assert";
import {
  cadastrarEEntrar,
  comServidor,
  conferirErro,
  conferirSemCorpo,
  conferirStatus,
  entrar,
  entrarComoAdm,
  requisitar,
  SENHA_PADRAO,
} from "../auxiliares/cliente-colega.ts";

Deno.test("sessões: logout da própria sessão dá 204 e o token deixa de valer", async () => {
  await comServidor(async ({ porta }) => {
    const sessao = await cadastrarEEntrar(porta, "sess.p");
    conferirStatus(
      await requisitar(porta, "GET", `/users/${sessao.idUsuario}`, {
        token: sessao.token,
      }),
      200,
    );
    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/sessions/${sessao.id}`, {
        token: sessao.token,
      }),
      204,
    );
    for (
      const [metodo, caminho] of [
        ["GET", `/users/${sessao.idUsuario}`],
        ["GET", "/products"],
        ["DELETE", `/sessions/${sessao.id}`],
      ]
    ) {
      conferirErro(
        await requisitar(porta, metodo, caminho, { token: sessao.token }),
        401,
      );
    }
    await entrar(porta, sessao.email, SENHA_PADRAO);
  });
});

Deno.test("sessões: o usuário encerra outra sessão sua usando o token de uma delas", async () => {
  await comServidor(async ({ porta }) => {
    const primeira = await cadastrarEEntrar(porta, "sess.m");
    const segunda = await entrar(porta, primeira.email, SENHA_PADRAO);
    assertNotEquals(primeira.id, segunda.id);
    assertNotEquals(primeira.token, segunda.token);

    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/sessions/${segunda.id}`, {
        token: primeira.token,
      }),
      204,
    );
    conferirErro(
      await requisitar(porta, "GET", "/products", { token: segunda.token }),
      401,
    );
    conferirStatus(
      await requisitar(porta, "GET", "/products", { token: primeira.token }),
      200,
    );
  });
});

Deno.test("sessões: sessão de outro usuário ou inexistente dá 403, inclusive para o ADM", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const ana = await cadastrarEEntrar(porta, "sess.a");
    const bia = await cadastrarEEntrar(porta, "sess.b");

    conferirErro(
      await requisitar(porta, "DELETE", `/sessions/${bia.id}`, {
        token: ana.token,
      }),
      403,
    );
    conferirErro(
      await requisitar(porta, "DELETE", `/sessions/${bia.id}`, {
        token: adm.token,
      }),
      403,
    );
    conferirErro(
      await requisitar(porta, "DELETE", `/sessions/${adm.id}`, {
        token: ana.token,
      }),
      403,
    );
    const inexistentes = [
      crypto.randomUUID(),
      "abc",
      "123",
      "%20",
      "a".repeat(300),
    ];
    for (const id of inexistentes) {
      for (const token of [ana.token, adm.token]) {
        conferirErro(
          await requisitar(porta, "DELETE", `/sessions/${id}`, { token }),
          403,
        );
      }
    }
    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/sessions/${ana.id}`, {
        token: ana.token,
      }),
      204,
    );
    conferirErro(
      await requisitar(porta, "DELETE", `/sessions/${ana.id}`, {
        token: adm.token,
      }),
      403,
    );
    conferirStatus(
      await requisitar(porta, "GET", "/products", { token: bia.token }),
      200,
    );
  });
});

Deno.test("sessões: DELETE sem token ou com token inválido dá 401 antes do 403", async () => {
  await comServidor(async ({ porta }) => {
    const sessao = await cadastrarEEntrar(porta, "sess.t");
    for (const id of [sessao.id, crypto.randomUUID(), "abc"]) {
      conferirErro(await requisitar(porta, "DELETE", `/sessions/${id}`), 401);
      for (
        const autorizacao of [
          "Bearer token-invalido",
          `Bearer ${sessao.token}x`,
          sessao.token,
          `Basic ${sessao.token}`,
          "Bearer ",
        ]
      ) {
        conferirErro(
          await requisitar(porta, "DELETE", `/sessions/${id}`, { autorizacao }),
          401,
        );
      }
    }
    conferirStatus(
      await requisitar(porta, "GET", "/products", { token: sessao.token }),
      200,
    );
  });
});

Deno.test("sessões: login com credenciais erradas dá 401 e corpo inválido dá 400", async () => {
  await comServidor(async ({ porta }) => {
    const sessao = await cadastrarEEntrar(porta, "sess.l");
    conferirErro(
      await requisitar(porta, "POST", "/sessions", {
        corpo: { email: sessao.email, senha: "SenhaErrada1" },
      }),
      401,
    );
    conferirErro(
      await requisitar(porta, "POST", "/sessions", {
        corpo: { email: "naoexiste@teste.com", senha: SENHA_PADRAO },
      }),
      401,
    );
    await entrar(porta, sessao.email.toUpperCase(), SENHA_PADRAO);
    for (
      const corpo of [
        { email: sessao.email },
        { senha: SENHA_PADRAO },
        { email: null, senha: SENHA_PADRAO },
        { email: sessao.email, senha: 123456 },
        { email: "semarroba", senha: SENHA_PADRAO },
        { email: sessao.email, senha: "com espaco" },
      ]
    ) {
      conferirErro(
        await requisitar(porta, "POST", "/sessions", { corpo }),
        400,
      );
    }
    conferirErro(
      await requisitar(porta, "POST", "/sessions", { corpoBruto: "{" }),
      400,
    );
  });
});
