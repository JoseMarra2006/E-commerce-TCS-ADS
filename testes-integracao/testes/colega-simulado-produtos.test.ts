import { assert, assertEquals } from "@std/assert";
import {
  cadastrarEEntrar,
  comServidor,
  conferirErro,
  conferirJson,
  conferirProduto,
  conferirSemCorpo,
  conferirStatus,
  criarProduto,
  entrarComoAdm,
  lerId,
  lerLista,
  lerObjeto,
  PREFIXO,
  requisitar,
} from "../auxiliares/cliente-colega.ts";

const ID_INEXISTENTE = 999999;
const PRODUTO_VALIDO = {
  nome: "Ingresso Show",
  descricao: "Pista",
  quantidade: 10,
};

Deno.test("produtos: sem token ou com token inválido, todas as rotas dão 401", async () => {
  await comServidor(async ({ porta }) => {
    const rotas: [string, string, unknown][] = [
      ["GET", "/products", undefined],
      ["POST", "/products", PRODUTO_VALIDO],
      ["GET", "/products/1", undefined],
      ["PUT", "/products/1", PRODUTO_VALIDO],
      ["PATCH", "/products/1", { quantidade: 1 }],
      ["DELETE", "/products/1", undefined],
      ["GET", "/products/abc", undefined],
      ["PUT", "/products/abc", { nome: 1 }],
    ];
    for (const [metodo, caminho, corpo] of rotas) {
      conferirErro(await requisitar(porta, metodo, caminho, { corpo }), 401);
      conferirErro(
        await requisitar(porta, metodo, caminho, {
          corpo,
          token: "token-invalido",
        }),
        401,
      );
      conferirErro(
        await requisitar(porta, metodo, caminho, {
          corpo,
          autorizacao: "Token qualquer",
        }),
        401,
      );
    }
  });
});

Deno.test("produtos: usuário comum lê lista e detalhe, mas recebe 403 em toda escrita", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comum = await cadastrarEEntrar(porta, "prod.c");
    const produto = await criarProduto(porta, adm.token, PRODUTO_VALIDO);
    const id = lerId(produto);

    const lista = await requisitar(porta, "GET", "/products", {
      token: comum.token,
    });
    conferirStatus(lista, 200);
    assertEquals(lerLista(lista), [produto]);
    const detalhe = await requisitar(porta, "GET", `/products/${id}`, {
      token: comum.token,
    });
    conferirStatus(detalhe, 200);
    assertEquals(lerObjeto(detalhe), produto);
    conferirErro(
      await requisitar(porta, "GET", `/products/${ID_INEXISTENTE}`, {
        token: comum.token,
      }),
      404,
    );

    const escritas: [string, string, unknown][] = [
      ["POST", "/products", PRODUTO_VALIDO],
      ["POST", "/products", { nome: "x" }],
      ["POST", "/products", undefined],
      ["PUT", `/products/${id}`, PRODUTO_VALIDO],
      ["PUT", `/products/${id}`, { quantidade: -1 }],
      ["PATCH", `/products/${id}`, { quantidade: 1 }],
      ["PATCH", `/products/${id}`, {}],
      ["DELETE", `/products/${id}`, undefined],
      ["PUT", `/products/${ID_INEXISTENTE}`, PRODUTO_VALIDO],
      ["PUT", `/products/${ID_INEXISTENTE}`, { nome: 1 }],
      ["PATCH", `/products/${ID_INEXISTENTE}`, { quantidade: 1 }],
      ["DELETE", `/products/${ID_INEXISTENTE}`, undefined],
    ];
    for (const [metodo, caminho, corpo] of escritas) {
      conferirErro(
        await requisitar(porta, metodo, caminho, { token: comum.token, corpo }),
        403,
      );
    }
    const depois = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    assertEquals(lerObjeto(depois), produto);
  });
});

Deno.test("produtos: CRUD completo do ADM com Location, PUT, PATCH parcial e exclusão", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const vazia = await requisitar(porta, "GET", "/products", {
      token: adm.token,
    });
    conferirStatus(vazia, 200);
    conferirJson(vazia);
    assertEquals(lerLista(vazia), []);

    const primeiro = await criarProduto(porta, adm.token, PRODUTO_VALIDO);
    const segundo = await criarProduto(porta, adm.token, {
      nome: "Camiseta",
      descricao: "",
      quantidade: 0,
    });
    const id = lerId(primeiro);
    assert(lerId(segundo) > id);

    const lista = await requisitar(porta, "GET", "/products", {
      token: adm.token,
    });
    conferirStatus(lista, 200);
    assertEquals(lerLista(lista), [primeiro, segundo]);

    const detalhe = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    conferirStatus(detalhe, 200);
    conferirJson(detalhe);
    assertEquals(lerObjeto(detalhe), primeiro);

    const substituido = await requisitar(porta, "PUT", `/products/${id}`, {
      token: adm.token,
      corpo: { nome: "Ingresso VIP", descricao: "Camarote", quantidade: 3 },
    });
    conferirStatus(substituido, 200);
    conferirProduto(lerObjeto(substituido), {
      id,
      nome: "Ingresso VIP",
      descricao: "Camarote",
      quantidade: 3,
    });

    const parcial = await requisitar(porta, "PATCH", `/products/${id}`, {
      token: adm.token,
      corpo: { quantidade: 2 },
    });
    conferirStatus(parcial, 200);
    const esperado = {
      id,
      nome: "Ingresso VIP",
      descricao: "Camarote",
      quantidade: 2,
    };
    conferirProduto(lerObjeto(parcial), esperado);
    const parcialDescricao = await requisitar(
      porta,
      "PATCH",
      `/products/${id}`,
      {
        token: adm.token,
        corpo: { descricao: "Camarote lateral" },
      },
    );
    conferirStatus(parcialDescricao, 200);
    conferirProduto(lerObjeto(parcialDescricao), {
      ...esperado,
      descricao: "Camarote lateral",
    });
    const relido = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    conferirProduto(lerObjeto(relido), {
      ...esperado,
      descricao: "Camarote lateral",
    });

    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/products/${id}`, {
        token: adm.token,
      }),
      204,
    );
    conferirErro(
      await requisitar(porta, "DELETE", `/products/${id}`, {
        token: adm.token,
      }),
      404,
    );
    conferirErro(
      await requisitar(porta, "GET", `/products/${id}`, { token: adm.token }),
      404,
    );
    conferirErro(
      await requisitar(porta, "PUT", `/products/${id}`, {
        token: adm.token,
        corpo: PRODUTO_VALIDO,
      }),
      404,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/products/${id}`, {
        token: adm.token,
        corpo: { quantidade: 1 },
      }),
      404,
    );
    const final = await requisitar(porta, "GET", "/products", {
      token: adm.token,
    });
    assertEquals(lerLista(final), [segundo]);
  });
});

Deno.test("produtos: Location da criação começa em /api/v1 e aponta para o produto criado", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const resposta = await requisitar(porta, "POST", "/products", {
      token: adm.token,
      corpo: PRODUTO_VALIDO,
    });
    conferirStatus(resposta, 201);
    const id = lerId(lerObjeto(resposta));
    const local = resposta.cabecalhos.get("Location");
    assertEquals(local, `${PREFIXO}/products/${id}`);
    assert(local !== null);
    const seguido = await fetch(`http://127.0.0.1:${porta}${local}`, {
      headers: { Authorization: `Bearer ${adm.token}` },
    });
    assertEquals(seguido.status, 200);
    assertEquals(lerId(await seguido.json()), id);
  });
});

Deno.test("produtos: nome inválido dá 400 e nome e descrição são aparados", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    for (const nome of ["", "a", "a".repeat(101), "     ", "  a  "]) {
      conferirErro(
        await requisitar(porta, "POST", "/products", {
          token: adm.token,
          corpo: { ...PRODUTO_VALIDO, nome },
        }),
        400,
      );
    }
    await criarProduto(porta, adm.token, {
      ...PRODUTO_VALIDO,
      nome: "a".repeat(100),
    });
    const aparado = await requisitar(porta, "POST", "/products", {
      token: adm.token,
      corpo: { nome: " ab ", descricao: "  com espacos  ", quantidade: 1 },
    });
    conferirStatus(aparado, 201);
    const produto = conferirProduto(lerObjeto(aparado), {
      nome: "ab",
      descricao: "com espacos",
      quantidade: 1,
    });
    const id = lerId(produto);

    const viaPut = await requisitar(porta, "PUT", `/products/${id}`, {
      token: adm.token,
      corpo: { nome: "  cd  ", descricao: "   ", quantidade: 1 },
    });
    conferirStatus(viaPut, 200);
    conferirProduto(lerObjeto(viaPut), { id, nome: "cd", descricao: "" });

    const viaPatch = await requisitar(porta, "PATCH", `/products/${id}`, {
      token: adm.token,
      corpo: { nome: "  ef  " },
    });
    conferirStatus(viaPatch, 200);
    conferirProduto(lerObjeto(viaPatch), { id, nome: "ef" });
    for (const nome of ["", " x ", "a".repeat(101)]) {
      conferirErro(
        await requisitar(porta, "PATCH", `/products/${id}`, {
          token: adm.token,
          corpo: { nome },
        }),
        400,
      );
    }
  });
});

Deno.test("produtos: descrição até 500, vazia aceita e obrigatória no POST e no PUT", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    conferirErro(
      await requisitar(porta, "POST", "/products", {
        token: adm.token,
        corpo: { ...PRODUTO_VALIDO, descricao: "d".repeat(501) },
      }),
      400,
    );
    await criarProduto(porta, adm.token, {
      ...PRODUTO_VALIDO,
      descricao: "d".repeat(500),
    });
    const comVazia = await criarProduto(porta, adm.token, {
      ...PRODUTO_VALIDO,
      descricao: "",
    });
    const id = lerId(comVazia);
    conferirErro(
      await requisitar(porta, "POST", "/products", {
        token: adm.token,
        corpo: { nome: "Sem Descricao", quantidade: 1 },
      }),
      400,
    );
    conferirErro(
      await requisitar(porta, "PUT", `/products/${id}`, {
        token: adm.token,
        corpo: { nome: "Sem Descricao", quantidade: 1 },
      }),
      400,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/products/${id}`, {
        token: adm.token,
        corpo: { descricao: "d".repeat(501) },
      }),
      400,
    );
    for (const descricao of [null, 10]) {
      conferirErro(
        await requisitar(porta, "POST", "/products", {
          token: adm.token,
          corpo: { ...PRODUTO_VALIDO, descricao },
        }),
        400,
      );
    }
    const intacto = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    assertEquals(lerObjeto(intacto), comVazia);
  });
});

Deno.test("produtos: quantidade fora das regras dá 400 e os limites 0 e 1.000.000 são aceitos", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const invalidas: unknown[] = [-1, 1000001, 1.5, "10", true, null];
    for (const quantidade of invalidas) {
      conferirErro(
        await requisitar(porta, "POST", "/products", {
          token: adm.token,
          corpo: { ...PRODUTO_VALIDO, quantidade },
        }),
        400,
      );
    }
    conferirErro(
      await requisitar(porta, "POST", "/products", {
        token: adm.token,
        corpo: { nome: "Sem Quantidade", descricao: "" },
      }),
      400,
    );
    await criarProduto(porta, adm.token, { ...PRODUTO_VALIDO, quantidade: 0 });
    const maximo = await criarProduto(porta, adm.token, {
      ...PRODUTO_VALIDO,
      quantidade: 1000000,
    });
    const id = lerId(maximo);
    for (const quantidade of invalidas) {
      conferirErro(
        await requisitar(porta, "PATCH", `/products/${id}`, {
          token: adm.token,
          corpo: { quantidade },
        }),
        400,
      );
      conferirErro(
        await requisitar(porta, "PUT", `/products/${id}`, {
          token: adm.token,
          corpo: { ...PRODUTO_VALIDO, quantidade },
        }),
        400,
      );
    }
    conferirErro(
      await requisitar(porta, "PUT", `/products/${id}`, {
        token: adm.token,
        corpo: { nome: "Sem Quantidade", descricao: "" },
      }),
      400,
    );
    const intacto = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    assertEquals(lerObjeto(intacto), maximo);
  });
});

Deno.test("produtos: corpo ausente, inválido ou que não é objeto dá 400; PATCH vazio dá 400", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const produto = await criarProduto(porta, adm.token, PRODUTO_VALIDO);
    const id = lerId(produto);
    const brutos = ["", "{", "[]", "[1]", "123", '"texto"', "null", "true"];
    for (const corpoBruto of brutos) {
      for (
        const [metodo, caminho] of [
          ["POST", "/products"],
          ["PUT", `/products/${id}`],
          ["PATCH", `/products/${id}`],
        ]
      ) {
        conferirErro(
          await requisitar(porta, metodo, caminho, {
            token: adm.token,
            corpoBruto,
          }),
          400,
        );
      }
    }
    conferirErro(
      await requisitar(porta, "POST", "/products", { token: adm.token }),
      400,
    );
    conferirErro(
      await requisitar(porta, "PATCH", `/products/${id}`, {
        token: adm.token,
        corpo: {},
      }),
      400,
    );
    const intacto = await requisitar(porta, "GET", `/products/${id}`, {
      token: adm.token,
    });
    assertEquals(lerObjeto(intacto), produto);
  });
});

Deno.test("produtos: Content-Type com charset é aceito e campos desconhecidos e id no corpo são ignorados", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comCharset = await requisitar(porta, "POST", "/products", {
      token: adm.token,
      corpo: { ...PRODUTO_VALIDO, extra: "ignorar", id: 777 },
      tipoConteudo: "application/json; charset=utf-8",
    });
    conferirStatus(comCharset, 201);
    const produto = conferirProduto(lerObjeto(comCharset), PRODUTO_VALIDO);
    const id = lerId(produto);
    assert(id !== 777);

    const substituido = await requisitar(porta, "PUT", `/products/${id}`, {
      token: adm.token,
      corpo: { ...PRODUTO_VALIDO, quantidade: 4, id: id + 50, extra: true },
    });
    conferirStatus(substituido, 200);
    conferirProduto(lerObjeto(substituido), { id, quantidade: 4 });

    const parcial = await requisitar(porta, "PATCH", `/products/${id}`, {
      token: adm.token,
      corpo: { quantidade: 5, id: id + 50 },
    });
    conferirStatus(parcial, 200);
    conferirProduto(lerObjeto(parcial), { id, quantidade: 5 });
    conferirErro(
      await requisitar(porta, "GET", `/products/${id + 50}`, {
        token: adm.token,
      }),
      404,
    );
  });
});

Deno.test("produtos: id da URL inválido dá 400 antes de 403 e de 404", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comum = await cadastrarEEntrar(porta, "prod.id");
    for (const idInvalido of ["abc", "1.5", "1a"]) {
      for (const token of [adm.token, comum.token]) {
        for (
          const [metodo, corpo] of [
            ["GET", undefined],
            ["PUT", { nome: 1 }],
            ["PATCH", {}],
            ["DELETE", undefined],
          ] as const
        ) {
          conferirErro(
            await requisitar(porta, metodo, `/products/${idInvalido}`, {
              token,
              corpo,
            }),
            400,
          );
        }
      }
    }
  });
});

Deno.test("produtos: para o ADM, 404 vem antes do 400 do corpo", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    for (
      const [metodo, corpo] of [
        ["PUT", { nome: "x" }],
        ["PATCH", {}],
        ["PUT", undefined],
      ] as const
    ) {
      conferirErro(
        await requisitar(porta, metodo, `/products/${ID_INEXISTENTE}`, {
          token: adm.token,
          corpo,
        }),
        404,
      );
    }
  });
});

Deno.test("produtos: nomes repetidos são aceitos e nunca geram 409", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const primeiro = await criarProduto(porta, adm.token, PRODUTO_VALIDO);
    const segundo = await criarProduto(porta, adm.token, PRODUTO_VALIDO);
    assert(lerId(primeiro) !== lerId(segundo));
    const terceiro = await criarProduto(porta, adm.token, {
      ...PRODUTO_VALIDO,
      nome: "Outro Nome",
    });
    const renomeado = await requisitar(
      porta,
      "PATCH",
      `/products/${lerId(terceiro)}`,
      { token: adm.token, corpo: { nome: PRODUTO_VALIDO.nome } },
    );
    conferirStatus(renomeado, 200);
    const lista = await requisitar(porta, "GET", "/products", {
      token: adm.token,
    });
    assertEquals(
      lerLista(lista).filter((item) => item.nome === PRODUTO_VALIDO.nome)
        .length,
      3,
    );
  });
});
