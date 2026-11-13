import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import { exigeAtualizacaoDeLogados } from "../src/pool/sinal-logados.ts";

type Caso = [string, string, number];

const ORIGEM = "http://10.20.50.1:20000";
const SESSAO = "9f1c2e3a-4b5d-4a6f-8c7e-1a2b3c4d5e6f";
const METODOS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
const STATUS_ERRO = [400, 401, 403, 404, 405, 409, 422, 500, 503];
const STATUS_SUCESSO = [200, 201, 204];

function variacoes(caminho: string): string[] {
  return [
    caminho,
    `${caminho}/`,
    `${caminho}?x=1`,
    `${caminho}/?x=1&y=2`,
    `${ORIGEM}${caminho}`,
    `${ORIGEM}${caminho}/?token=abc`,
    `${caminho}#fragmento`,
  ];
}

function caixas(metodo: string): string[] {
  return [
    metodo,
    metodo.toLowerCase(),
    metodo[0] + metodo.slice(1).toLowerCase(),
  ];
}

function conferir(casos: Caso[], esperado: boolean): void {
  for (const [metodo, endereco, status] of casos) {
    assertEquals(
      exigeAtualizacaoDeLogados(metodo, endereco, status),
      esperado,
      `${metodo} ${endereco} ${status}`,
    );
  }
}

function positivos(): Caso[] {
  const casos: Caso[] = [];
  const idsSessao = [
    SESSAO,
    `%39${SESSAO.slice(1)}`,
    "abc%2Fdef",
    "%E2%9C%93",
    "qualquer",
    "123",
  ];
  for (const metodo of caixas("POST")) {
    for (const endereco of variacoes("/api/v1/sessions")) {
      casos.push([metodo, endereco, 201]);
    }
  }
  for (const metodo of caixas("DELETE")) {
    for (const id of idsSessao) {
      for (const endereco of variacoes(`/api/v1/sessions/${id}`)) {
        casos.push([metodo, endereco, 204]);
      }
    }
    for (const id of ["1", "42", "007", "9007199254740991", "%31"]) {
      for (const endereco of variacoes(`/api/v1/users/${id}`)) {
        casos.push([metodo, endereco, 204]);
      }
    }
  }
  for (const base of ["PUT", "PATCH"]) {
    for (const metodo of caixas(base)) {
      for (const endereco of variacoes("/api/v1/users/7")) {
        casos.push([metodo, endereco, 200]);
      }
    }
  }
  return casos;
}

Deno.test("dispara em login 201, logout 204, exclusão de usuário 204 e PUT/PATCH de usuário 200", () => {
  conferir(positivos(), true);
});

Deno.test("não dispara com status de erro nas rotas que disparam", () => {
  const casos: Caso[] = [];
  for (const status of [...STATUS_ERRO, 200, 204]) {
    casos.push(["POST", "/api/v1/sessions", status]);
  }
  for (const status of [...STATUS_ERRO, 200, 201]) {
    casos.push(["DELETE", `/api/v1/sessions/${SESSAO}`, status]);
    casos.push(["DELETE", "/api/v1/users/7", status]);
  }
  for (const status of [...STATUS_ERRO, 201, 204]) {
    casos.push(["PUT", "/api/v1/users/7", status]);
    casos.push(["PATCH", "/api/v1/users/7", status]);
  }
  conferir(casos, false);
});

Deno.test("não dispara com outros métodos nas rotas que disparam", () => {
  const casos: Caso[] = [];
  for (const status of STATUS_SUCESSO) {
    for (const metodo of METODOS.filter((m) => m !== "POST")) {
      casos.push([metodo, "/api/v1/sessions", status]);
    }
    for (const metodo of METODOS.filter((m) => m !== "DELETE")) {
      casos.push([metodo, `/api/v1/sessions/${SESSAO}`, status]);
    }
    for (
      const metodo of METODOS.filter((m) =>
        !["DELETE", "PUT", "PATCH"].includes(m)
      )
    ) {
      casos.push([metodo, "/api/v1/users/7", status]);
    }
  }
  conferir(casos, false);
});

Deno.test("não dispara em /users, em produtos nem em GET, HEAD e OPTIONS", () => {
  const casos: Caso[] = [];
  const caminhos = [
    "/api/v1/users",
    "/api/v1/products",
    "/api/v1/products/1",
    "/api/v1/products/abc",
  ];
  for (const caminho of caminhos) {
    for (const endereco of variacoes(caminho)) {
      for (const metodo of METODOS) {
        for (const status of [...STATUS_SUCESSO, ...STATUS_ERRO]) {
          casos.push([metodo, endereco, status]);
        }
      }
    }
  }
  for (const metodo of ["GET", "HEAD", "OPTIONS"]) {
    for (
      const caminho of [
        "/api/v1/sessions",
        `/api/v1/sessions/${SESSAO}`,
        "/api/v1/users/7",
      ]
    ) {
      for (const status of [200, 201, 204]) {
        casos.push([metodo, caminho, status]);
      }
    }
  }
  casos.push(["POST", "/api/v1/users", 201]);
  conferir(casos, false);
});

Deno.test("não dispara com o 400 de id inválido nem em caminhos desconhecidos", () => {
  const casos: Caso[] = [];
  for (const id of ["abc", "0", "-1", "1.5", "12345678901234567890"]) {
    for (const metodo of ["DELETE", "PUT", "PATCH"]) {
      casos.push([metodo, `/api/v1/users/${id}`, 400]);
    }
  }
  const desconhecidos = [
    "/",
    "",
    "/api/v1",
    "/api/v1/",
    "/sessions",
    "/users/7",
    "/api/v2/sessions",
    "/api/v1/session",
    "/api/v1/Sessions",
    "/API/V1/sessions",
    "/api/v1/sessions/a/b",
    "/api/v1/sessions//",
    "/api/v1/users/7/extra",
    "/api/v1/usuarios/7",
    "/api/v1/sessionsx",
    "/api/v1/users7",
    "/x/api/v1/sessions",
  ];
  for (const caminho of desconhecidos) {
    casos.push(["POST", caminho, 201]);
    casos.push(["DELETE", caminho, 204]);
    casos.push(["PUT", caminho, 200]);
    casos.push(["PATCH", caminho, 200]);
  }
  casos.push(["POST", "http://[invalido", 201]);
  casos.push(["DELETE", "http://[invalido/api/v1/sessions/x", 204]);
  conferir(casos, false);
});
