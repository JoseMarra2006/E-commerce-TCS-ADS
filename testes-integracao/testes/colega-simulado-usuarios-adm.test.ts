import { assertEquals, assertNotEquals } from "@std/assert";
import {
  cadastrar,
  cadastrarEEntrar,
  comServidor,
  conferirErro,
  conferirJson,
  conferirSemCorpo,
  conferirStatus,
  conferirUsuario,
  EMAIL_ADM,
  emailUnico,
  entrar,
  entrarComoAdm,
  lerId,
  lerLista,
  lerObjeto,
  NOME_ADM,
  requisitar,
  SENHA_ADM,
  SENHA_PADRAO,
} from "../auxiliares/cliente-colega.ts";

const ID_INEXISTENTE = 999999;

Deno.test("ADM padrão: login devolve sessão com admin verdadeiro e Location", async () => {
  await comServidor(async ({ porta }) => {
    const sessao = await entrar(porta, EMAIL_ADM, SENHA_ADM);
    conferirUsuario(sessao.usuario, {
      nome: NOME_ADM,
      email: EMAIL_ADM,
      admin: true,
    });
    assertNotEquals(sessao.id, sessao.token);

    const lido = await requisitar(porta, "GET", `/users/${sessao.idUsuario}`, {
      token: sessao.token,
    });
    conferirStatus(lido, 200);
    conferirJson(lido);
    conferirUsuario(lerObjeto(lido), {
      id: sessao.idUsuario,
      nome: NOME_ADM,
      email: EMAIL_ADM,
      admin: true,
    });
  });
});

Deno.test("ADM padrão: e-mail do ADM em qualquer capitalização dá 409 no cadastro", async () => {
  await comServidor(async ({ porta }) => {
    for (const email of [EMAIL_ADM, EMAIL_ADM.toUpperCase()]) {
      const resposta = await requisitar(porta, "POST", "/users", {
        corpo: { nome: "Impostor", email, senha: SENHA_PADRAO },
      });
      conferirErro(resposta, 409);
    }
  });
});

Deno.test("campo admin: presente e falso em cadastro, login, GET, PUT e PATCH do usuário comum", async () => {
  await comServidor(async ({ porta }) => {
    const email = emailUnico("adm.b");
    const criado = await requisitar(porta, "POST", "/users", {
      corpo: { nome: "Comum Admin", email, senha: SENHA_PADRAO },
    });
    conferirStatus(criado, 201);
    const id = lerId(
      conferirUsuario(lerObjeto(criado), {
        nome: "Comum Admin",
        email,
        admin: false,
      }),
    );

    const sessao = await entrar(porta, email, SENHA_PADRAO);
    conferirUsuario(sessao.usuario, { id, email, admin: false });

    const lido = await requisitar(porta, "GET", `/users/${id}`, {
      token: sessao.token,
    });
    conferirStatus(lido, 200);
    conferirUsuario(lerObjeto(lido), { id, email, admin: false });

    const novoEmail = emailUnico("adm.b2");
    const substituido = await requisitar(porta, "PUT", `/users/${id}`, {
      token: sessao.token,
      corpo: { nome: "Comum Trocado", email: novoEmail, senha: SENHA_PADRAO },
    });
    conferirStatus(substituido, 200);
    conferirUsuario(lerObjeto(substituido), {
      id,
      nome: "Comum Trocado",
      email: novoEmail,
      admin: false,
    });

    const parcial = await requisitar(porta, "PATCH", `/users/${id}`, {
      token: sessao.token,
      corpo: { nome: "Comum Parcial" },
    });
    conferirStatus(parcial, 200);
    conferirUsuario(lerObjeto(parcial), {
      id,
      nome: "Comum Parcial",
      email: novoEmail,
      admin: false,
    });
  });
});

Deno.test("campo admin enviado no corpo é ignorado em POST, PUT e PATCH de usuário", async () => {
  await comServidor(async ({ porta }) => {
    const email = emailUnico("adm.i");
    const criado = await requisitar(porta, "POST", "/users", {
      corpo: { nome: "Quer Ser Adm", email, senha: SENHA_PADRAO, admin: true },
    });
    conferirStatus(criado, 201);
    const id = lerId(
      conferirUsuario(lerObjeto(criado), { email, admin: false }),
    );
    const sessao = await entrar(porta, email, SENHA_PADRAO);
    conferirUsuario(sessao.usuario, { id, admin: false });

    const substituido = await requisitar(porta, "PUT", `/users/${id}`, {
      token: sessao.token,
      corpo: { nome: "Quer Ser Adm", email, senha: SENHA_PADRAO, admin: true },
    });
    conferirStatus(substituido, 200);
    conferirUsuario(lerObjeto(substituido), { id, admin: false });

    const parcial = await requisitar(porta, "PATCH", `/users/${id}`, {
      token: sessao.token,
      corpo: { nome: "Ainda Comum", admin: true },
    });
    conferirStatus(parcial, 200);
    conferirUsuario(lerObjeto(parcial), {
      id,
      nome: "Ainda Comum",
      admin: false,
    });

    const soAdmin = await requisitar(porta, "PATCH", `/users/${id}`, {
      token: sessao.token,
      corpo: { admin: true },
    });
    conferirErro(soAdmin, 400);

    const proibido = await requisitar(porta, "GET", "/users", {
      token: sessao.token,
    });
    conferirErro(proibido, 403);
  });
});

Deno.test("GET /users: sem token 401, comum 403, ADM 200 com todos ordenados por id", async () => {
  await comServidor(async ({ porta }) => {
    const semToken = await requisitar(porta, "GET", "/users");
    conferirErro(semToken, 401);
    const tokenInvalido = await requisitar(porta, "GET", "/users", {
      token: "token-que-nao-existe",
    });
    conferirErro(tokenInvalido, 401);

    const comum = await cadastrarEEntrar(porta, "lista.c");
    const outros = [
      await cadastrar(porta, "lista.a", "Lista Um"),
      await cadastrar(porta, "lista.b", "Lista Dois"),
    ];
    const proibido = await requisitar(porta, "GET", "/users", {
      token: comum.token,
    });
    conferirErro(proibido, 403);

    const adm = await entrarComoAdm(porta);
    const resposta = await requisitar(porta, "GET", "/users", {
      token: adm.token,
    });
    conferirStatus(resposta, 200);
    conferirJson(resposta);
    const lista = lerLista(resposta);
    const ids = lista.map(lerId);
    assertEquals(ids, [...ids].sort((a, b) => a - b));
    assertEquals(new Set(ids).size, ids.length);
    for (const usuario of lista) {
      conferirUsuario(usuario, { admin: usuario.email === EMAIL_ADM });
    }
    for (
      const id of [
        adm.idUsuario,
        comum.idUsuario,
        ...outros.map((u) => u.id),
      ]
    ) {
      assertEquals(ids.includes(id), true, `usuário ${id} ausente da lista`);
    }
    assertEquals(lista.length, 4);
    assertEquals(
      lista.filter((usuario) => usuario.email === EMAIL_ADM).length,
      1,
    );
  });
});

Deno.test("ADM sobre outro usuário: GET 200, PUT 200, PATCH 200 e DELETE 204", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const alvo = await cadastrar(porta, "alvo", "Alvo Inicial");

    const lido = await requisitar(porta, "GET", `/users/${alvo.id}`, {
      token: adm.token,
    });
    conferirStatus(lido, 200);
    conferirUsuario(lerObjeto(lido), { ...alvo, admin: false });

    const novoEmail = emailUnico("alvo.n");
    const substituido = await requisitar(porta, "PUT", `/users/${alvo.id}`, {
      token: adm.token,
      corpo: { nome: "Alvo Trocado", email: novoEmail, senha: "NovaSenha9" },
    });
    conferirStatus(substituido, 200);
    conferirUsuario(lerObjeto(substituido), {
      id: alvo.id,
      nome: "Alvo Trocado",
      email: novoEmail,
      admin: false,
    });
    await entrar(porta, novoEmail, "NovaSenha9");

    const parcial = await requisitar(porta, "PATCH", `/users/${alvo.id}`, {
      token: adm.token,
      corpo: { nome: "  Alvo Parcial  " },
    });
    conferirStatus(parcial, 200);
    conferirUsuario(lerObjeto(parcial), {
      id: alvo.id,
      nome: "Alvo Parcial",
      email: novoEmail,
      admin: false,
    });

    const excluido = await requisitar(porta, "DELETE", `/users/${alvo.id}`, {
      token: adm.token,
    });
    conferirSemCorpo(excluido, 204);
    const depois = await requisitar(porta, "GET", `/users/${alvo.id}`, {
      token: adm.token,
    });
    conferirErro(depois, 404);
  });
});

Deno.test("id inexistente: ADM recebe 404 e comum recebe 403 em GET, PUT, PATCH e DELETE", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comum = await cadastrarEEntrar(porta, "inex");
    const corpos: Record<string, unknown> = {
      GET: undefined,
      PUT: {
        nome: "Ninguem",
        email: emailUnico("inex.p"),
        senha: SENHA_PADRAO,
      },
      PATCH: { nome: "Ninguem" },
      DELETE: undefined,
    };
    for (const [metodo, corpo] of Object.entries(corpos)) {
      const doAdm = await requisitar(
        porta,
        metodo,
        `/users/${ID_INEXISTENTE}`,
        {
          token: adm.token,
          corpo,
        },
      );
      conferirErro(doAdm, 404);
      const doComum = await requisitar(
        porta,
        metodo,
        `/users/${ID_INEXISTENTE}`,
        { token: comum.token, corpo },
      );
      conferirErro(doComum, 403);
      const deOutroExistente = await requisitar(
        porta,
        metodo,
        `/users/${adm.idUsuario}`,
        { token: comum.token, corpo },
      );
      conferirErro(deOutroExistente, 403);
    }
  });
});

Deno.test("ordem de validação em /users/{id}: 401, 400 do id, 403, 404, 400 do corpo e 409", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comum = await cadastrarEEntrar(porta, "ordem.c");
    const outro = await cadastrar(porta, "ordem.o");
    const corpoInvalido = { nome: "x", email: "invalido", senha: "!" };
    const corpoDuplicado = { email: outro.email };

    conferirErro(
      await requisitar(porta, "PATCH", "/users/abc", { corpo: corpoInvalido }),
      401,
    );
    conferirErro(
      await requisitar(porta, "PATCH", "/users/abc", {
        token: "invalido",
        corpo: corpoInvalido,
      }),
      401,
    );
    for (const idInvalido of ["abc", "1.5"]) {
      conferirErro(
        await requisitar(porta, "PATCH", `/users/${idInvalido}`, {
          token: comum.token,
          corpo: corpoInvalido,
        }),
        400,
      );
      conferirErro(
        await requisitar(porta, "GET", `/users/${idInvalido}`, {
          token: adm.token,
        }),
        400,
      );
    }
    conferirErro(
      await requisitar(porta, "PATCH", `/users/${outro.id}`, {
        token: comum.token,
        corpo: corpoInvalido,
      }),
      403,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/users/${ID_INEXISTENTE}`, {
        token: adm.token,
        corpo: corpoInvalido,
      }),
      404,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/users/${comum.idUsuario}`, {
        token: comum.token,
        corpo: { nome: "x", email: outro.email },
      }),
      400,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/users/${comum.idUsuario}`, {
        token: comum.token,
        corpo: corpoDuplicado,
      }),
      409,
    );
    conferirErro(
      await requisitar(porta, "PUT", `/users/${comum.idUsuario}`, {
        token: adm.token,
        corpo: {
          nome: "Duplicado",
          email: outro.email.toUpperCase(),
          senha: SENHA_PADRAO,
        },
      }),
      409,
    );
    conferirErro(
      await requisitar(porta, "PUT", `/users/${comum.idUsuario}`, {
        token: adm.token,
        corpo: { nome: "Sem Senha", email: comum.email },
      }),
      400,
    );
  });
});

Deno.test("exclusão pelo ADM derruba as sessões do excluído; edição pelo ADM mantém a sessão do ADM", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const alvo = await cadastrarEEntrar(porta, "derruba");
    const segundaSessao = await entrar(porta, alvo.email, SENHA_PADRAO);

    conferirStatus(
      await requisitar(porta, "PUT", `/users/${alvo.idUsuario}`, {
        token: adm.token,
        corpo: { nome: "Editado Adm", email: alvo.email, senha: SENHA_PADRAO },
      }),
      200,
    );
    conferirStatus(
      await requisitar(porta, "PATCH", `/users/${alvo.idUsuario}`, {
        token: adm.token,
        corpo: { nome: "Editado Patch" },
      }),
      200,
    );
    conferirStatus(
      await requisitar(porta, "GET", "/users", { token: adm.token }),
      200,
    );
    conferirStatus(
      await requisitar(porta, "GET", `/users/${alvo.idUsuario}`, {
        token: alvo.token,
      }),
      200,
    );

    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/users/${alvo.idUsuario}`, {
        token: adm.token,
      }),
      204,
    );
    for (const token of [alvo.token, segundaSessao.token]) {
      conferirErro(
        await requisitar(porta, "GET", `/users/${alvo.idUsuario}`, { token }),
        401,
      );
      conferirErro(await requisitar(porta, "GET", "/products", { token }), 401);
    }
    conferirStatus(
      await requisitar(porta, "GET", "/users", { token: adm.token }),
      200,
    );
    conferirErro(
      await requisitar(porta, "POST", "/sessions", {
        corpo: { email: alvo.email, senha: SENHA_PADRAO },
      }),
      401,
    );
  });
});
