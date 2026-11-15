import { assertEquals } from "@std/assert";
import {
  cadastrar,
  cadastrarEEntrar,
  comServidor,
  conferirErro,
  conferirSemCorpo,
  criarProduto,
  entrarComoAdm,
  requisitar,
  SENHA_PADRAO,
} from "../auxiliares/cliente-colega.ts";

const CAMINHOS = [
  "/users",
  "/users/1",
  "/sessions",
  "/sessions/qualquer",
  "/products",
  "/products/1",
];

Deno.test("CORS: OPTIONS em toda rota dá 204 sem corpo, sem token e com os cabeçalhos", async () => {
  await comServidor(async ({ porta }) => {
    for (const caminho of CAMINHOS) {
      conferirSemCorpo(await requisitar(porta, "OPTIONS", caminho), 204);
    }
  });
});

Deno.test("CORS e ErroResponse: presentes nos erros 400, 401, 403, 404, 405 e 409", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const comum = await cadastrarEEntrar(porta, "cors.c");
    const outro = await cadastrar(porta, "cors.o");
    const casos: [number, Promise<Awaited<ReturnType<typeof requisitar>>>][] = [
      [
        400,
        requisitar(porta, "POST", "/users", {
          corpo: { nome: "x", email: "x", senha: "x" },
        }),
      ],
      [
        400,
        requisitar(porta, "POST", "/products", {
          token: adm.token,
          corpo: { nome: "x" },
        }),
      ],
      [400, requisitar(porta, "GET", "/products/abc", { token: adm.token })],
      [401, requisitar(porta, "GET", "/products")],
      [401, requisitar(porta, "GET", "/users/1", { token: "invalido" })],
      [403, requisitar(porta, "GET", "/users", { token: comum.token })],
      [
        403,
        requisitar(porta, "POST", "/products", {
          token: comum.token,
          corpo: { nome: "Produto", descricao: "", quantidade: 1 },
        }),
      ],
      [
        403,
        requisitar(porta, "DELETE", `/sessions/${adm.id}`, {
          token: comum.token,
        }),
      ],
      [404, requisitar(porta, "GET", "/products/999999", { token: adm.token })],
      [404, requisitar(porta, "GET", "/users/999999", { token: adm.token })],
      [404, requisitar(porta, "GET", "/inexistente", { token: adm.token })],
      [
        404,
        requisitar(porta, "GET", "/products/1/extra", { token: adm.token }),
      ],
      [405, requisitar(porta, "PATCH", "/products", { token: adm.token })],
      [
        409,
        requisitar(porta, "POST", "/users", {
          corpo: { nome: "Repetido", email: outro.email, senha: SENHA_PADRAO },
        }),
      ],
      [
        409,
        requisitar(porta, "PATCH", `/users/${comum.idUsuario}`, {
          token: comum.token,
          corpo: { email: outro.email },
        }),
      ],
    ];
    for (const [status, promessa] of casos) {
      conferirErro(await promessa, status);
    }
  });
});

Deno.test("405: método não suportado em rota existente, com ErroResponse, CORS e Allow", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    await criarProduto(porta, adm.token, {
      nome: "Produto",
      descricao: "",
      quantidade: 1,
    });
    const rotas: [string, string[], string][] = [
      ["/users", ["PUT", "PATCH", "DELETE"], "GET, HEAD, POST, OPTIONS"],
      [
        `/users/${adm.idUsuario}`,
        ["POST"],
        "GET, HEAD, PUT, PATCH, DELETE, OPTIONS",
      ],
      ["/sessions", ["GET", "PUT", "PATCH", "DELETE"], "POST, OPTIONS"],
      [
        `/sessions/${adm.id}`,
        ["GET", "POST", "PUT", "PATCH"],
        "DELETE, OPTIONS",
      ],
      ["/products", ["PUT", "PATCH", "DELETE"], "GET, HEAD, POST, OPTIONS"],
      ["/products/1", ["POST"], "GET, HEAD, PUT, PATCH, DELETE, OPTIONS"],
    ];
    for (const [caminho, metodos, permitidos] of rotas) {
      for (const metodo of metodos) {
        const resposta = await requisitar(porta, metodo, caminho, {
          token: adm.token,
        });
        conferirErro(resposta, 405);
        assertEquals(resposta.cabecalhos.get("Allow"), permitidos);
      }
    }
    conferirSemCorpo(
      await requisitar(porta, "DELETE", `/sessions/${adm.id}`, {
        token: adm.token,
      }),
      204,
    );
  });
});
