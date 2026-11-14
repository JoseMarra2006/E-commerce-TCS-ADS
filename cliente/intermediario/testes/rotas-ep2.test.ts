import { assert, assertEquals, assertGreaterOrEqual, assertStringIncludes } from "@std/assert";
import { encaminharRequisicao } from "../src/encaminhar.ts";
import { validarPedidoEnvio } from "../src/pedido-envio.ts";
import type { MetodoEnvio, PedidoEnvio } from "../src/pedido-envio.ts";
import { iniciarServidorFalso, pedidoValido } from "./auxiliares.ts";

const LIMITE_RESPOSTA_BYTES = 2 * 1024 * 1024;
const CORPO_PRODUTO = '{"nome":"Ingresso pista","descricao":"","quantidade":10}';
const CORPO_USUARIO = '{"nome":"Bruno Dias"}';

type RotaNova = [MetodoEnvio, string, string | null];

const ROTAS_NOVAS: RotaNova[] = [
  ["GET", "/api/v1/users", null],
  ["GET", "/api/v1/products", null],
  ["POST", "/api/v1/products", CORPO_PRODUTO],
  ["GET", "/api/v1/products/7", null],
  ["PUT", "/api/v1/products/7", CORPO_PRODUTO],
  ["DELETE", "/api/v1/products/7", null],
  ["GET", "/api/v1/users/9", null],
  ["PATCH", "/api/v1/users/9", CORPO_USUARIO],
  ["PUT", "/api/v1/users/9", '{"nome":"Bruno","email":"b@b.com","senha":"abc123"}'],
  ["DELETE", "/api/v1/users/9", null],
];

function pedido(porta: number, rota: RotaNova, token: string | null = "tok.en.jwt"): PedidoEnvio {
  const [metodo, caminho, corpo] = rota;
  return { ip: "127.0.0.1", porta, metodo, caminho, token, corpo };
}

const DESCRICAO_500 = "d".repeat(500);

function produtoDaLista(id: number) {
  return { id, nome: `Produto ${id}`, descricao: DESCRICAO_500, quantidade: 1000000 };
}

function montarListaProdutos(quantidade: number): string {
  return JSON.stringify(
    Array.from({ length: quantidade }, (_, indice) => produtoDaLista(indice + 1)),
  );
}

function quantidadeQueCabe(limiteBytes: number): number {
  let total = 2;
  let quantidade = 0;
  while (true) {
    const separador = quantidade === 0 ? 0 : 1;
    const tamanhoItem = JSON.stringify(produtoDaLista(quantidade + 1)).length;
    if (total + separador + tamanhoItem > limiteBytes) {
      return quantidade;
    }
    total += separador + tamanhoItem;
    quantidade++;
  }
}

Deno.test("validador aceita todas as rotas e métodos novos da EP-2", () => {
  for (const [metodo, caminho, corpo] of ROTAS_NOVAS) {
    const resultado = validarPedidoEnvio(pedidoValido({ metodo, caminho, corpo, token: "t" }));
    assert(resultado.ok, `${metodo} ${caminho}`);
    assertEquals(resultado.pedido.caminho, caminho);
    assertEquals(resultado.pedido.corpo, corpo);
  }
});

Deno.test("validador aceita ids com vários dígitos e barra final", () => {
  for (
    const caminho of [
      "/api/v1/products/1234567890",
      "/api/v1/users/9007199254740991",
      "/api/v1/products/",
      "/api/v1/users/",
      "/api/v1/products/12/",
    ]
  ) {
    assert(validarPedidoEnvio(pedidoValido({ metodo: "GET", caminho, corpo: null })).ok, caminho);
  }
});

Deno.test("validador recusa query string, que o cliente não usa", () => {
  for (const caminho of ["/api/v1/products?pagina=1", "/api/v1/users?a=b&c=d"]) {
    const resultado = validarPedidoEnvio(pedidoValido({ metodo: "GET", caminho, corpo: null }));
    assert(!resultado.ok, caminho);
    assertStringIncludes(resultado.mensagem, "O campo caminho do pedido");
  }
});

Deno.test("validador continua recusando caminhos fora do prefixo, com '..' ou caracteres inválidos", () => {
  for (
    const caminho of [
      "/products",
      "/api/v2/products",
      "/api/v1",
      "api/v1/products",
      "/api/v1/products/../users",
      "/api/v1/products/..",
      "/api/v1/products/1 2",
      "/api/v1/products/<1>",
      "/api/v1/products#topo",
      "/api/v1/produtos/ç",
    ]
  ) {
    const resultado = validarPedidoEnvio(pedidoValido({ metodo: "GET", caminho, corpo: null }));
    assert(!resultado.ok, caminho);
    assertStringIncludes(resultado.mensagem, "O campo caminho do pedido");
  }
});

Deno.test("validador continua recusando corpo em GET, DELETE e OPTIONS das rotas novas", () => {
  for (
    const [metodo, caminho] of [
      ["GET", "/api/v1/products"],
      ["GET", "/api/v1/users"],
      ["DELETE", "/api/v1/products/7"],
      ["DELETE", "/api/v1/users/9"],
      ["OPTIONS", "/api/v1/products"],
    ]
  ) {
    const resultado = validarPedidoEnvio(pedidoValido({ metodo, caminho, corpo: "{}" }));
    assert(!resultado.ok, `${metodo} ${caminho}`);
    assertStringIncludes(resultado.mensagem, "GET, DELETE e OPTIONS");
  }
});

Deno.test("validador continua recusando métodos fora da lista", () => {
  for (const metodo of ["HEAD", "CONNECT", "TRACE", "get", "Post"]) {
    const resultado = validarPedidoEnvio(
      pedidoValido({ metodo, caminho: "/api/v1/products", corpo: null }),
    );
    assert(!resultado.ok, metodo);
    assertStringIncludes(resultado.mensagem, "O campo metodo do pedido");
  }
});

Deno.test("validador aceita corpo de exatamente 1 MB e recusa acima disso em POST de produto", () => {
  const umMega = 1024 * 1024;
  const exato = validarPedidoEnvio(
    pedidoValido({ caminho: "/api/v1/products", corpo: "a".repeat(umMega) }),
  );
  assert(exato.ok);
  const acima = validarPedidoEnvio(
    pedidoValido({ caminho: "/api/v1/products", corpo: "a".repeat(umMega + 1) }),
  );
  assert(!acima.ok);
  assertStringIncludes(acima.mensagem, "no máximo 1 MB");
});

Deno.test("encaminha cada rota nova com método, caminho, cabeçalhos e corpo exatos", async () => {
  const servidor = iniciarServidorFalso(() => new Response("{}"));
  try {
    for (const rota of ROTAS_NOVAS) {
      const resultado = await encaminharRequisicao(pedido(servidor.porta, rota));
      assert(resultado.tipo === "resposta", `${rota[0]} ${rota[1]}`);
      const recebida = servidor.requisicoes.at(-1);
      assert(recebida !== undefined);
      const [metodo, caminho, corpo] = rota;
      assertEquals(recebida.metodo, metodo);
      assertEquals(recebida.caminho, caminho);
      assertEquals(recebida.cabecalhos.get("authorization"), "Bearer tok.en.jwt");
      if (corpo === null) {
        assertEquals(recebida.corpo.length, 0, `${metodo} ${caminho}`);
        assertEquals(recebida.cabecalhos.get("content-type"), null);
      } else {
        assertEquals(new TextDecoder().decode(recebida.corpo), corpo);
        assertEquals(recebida.cabecalhos.get("content-type"), "application/json");
      }
    }
    assertEquals(servidor.requisicoes.length, ROTAS_NOVAS.length);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("201 de POST /api/v1/products chega com status, corpo e todos os cabeçalhos intactos", async () => {
  const corpo = '{"id":7,"nome":"Ingresso pista","descricao":"","quantidade":10}';
  const cabecalhosDestino: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Location": "/api/v1/products/7",
    "Access-Control-Allow-Origin": "*",
    "X-Cabecalho-Do-Colega": "Valor Misto",
  };
  const servidor = iniciarServidorFalso(() =>
    new Response(corpo, { status: 201, headers: cabecalhosDestino })
  );
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["POST", "/api/v1/products", CORPO_PRODUTO]),
    );
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.status, 201);
    assertEquals(resultado.corpo, corpo);
    assertEquals(resultado.cabecalhos["location"], "/api/v1/products/7");
    for (const [nome, valor] of Object.entries(cabecalhosDestino)) {
      assertEquals(resultado.cabecalhos[nome.toLowerCase()], valor, nome);
    }
    assert(Object.keys(resultado.cabecalhos).every((nome) => nome === nome.toLowerCase()));
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("204 de DELETE /api/v1/products/{id} chega sem corpo", async () => {
  const servidor = iniciarServidorFalso(() => new Response(null, { status: 204 }));
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["DELETE", "/api/v1/products/7", null]),
    );
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.status, 204);
    assertEquals(resultado.corpo, "");
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("400, 401, 403 e 404 do destino chegam intactos com o corpo de erro", async () => {
  const casos: Array<[number, string, RotaNova]> = [
    [400, "O campo quantidade deve ser um número inteiro.", [
      "POST",
      "/api/v1/products",
      CORPO_PRODUTO,
    ]],
    [401, "Token inválido.", ["GET", "/api/v1/products", null]],
    [403, "Apenas administradores podem cadastrar produtos.", [
      "POST",
      "/api/v1/products",
      CORPO_PRODUTO,
    ]],
    [404, "Produto não encontrado.", ["GET", "/api/v1/products/99", null]],
    [403, "Apenas administradores podem listar os usuários.", ["GET", "/api/v1/users", null]],
  ];
  for (const [status, mensagem, rota] of casos) {
    const corpo = JSON.stringify({ mensagem });
    const servidor = iniciarServidorFalso(() =>
      new Response(corpo, { status, headers: { "Content-Type": "application/json" } })
    );
    try {
      const resultado = await encaminharRequisicao(pedido(servidor.porta, rota));
      assert(resultado.tipo === "resposta");
      assertEquals(resultado.status, status);
      assertEquals(resultado.corpo, corpo);
      assertEquals(resultado.cabecalhos["content-type"], "application/json");
    } finally {
      await servidor.encerrar();
    }
  }
});

Deno.test("lista de produtos logo abaixo de 2 MB passa inteira", async () => {
  const quantidade = quantidadeQueCabe(LIMITE_RESPOSTA_BYTES);
  const lista = montarListaProdutos(quantidade);
  const tamanho = new TextEncoder().encode(lista).length;
  assert(tamanho <= LIMITE_RESPOSTA_BYTES);
  assertGreaterOrEqual(tamanho, LIMITE_RESPOSTA_BYTES - 1000);
  const servidor = iniciarServidorFalso(() => new Response(lista));
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["GET", "/api/v1/products", null]),
    );
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.corpo.length, lista.length);
    assertEquals(JSON.parse(resultado.corpo).length, quantidade);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("lista de produtos acima de 2 MB vira resposta_muito_grande", async () => {
  const lista = montarListaProdutos(quantidadeQueCabe(LIMITE_RESPOSTA_BYTES) + 1);
  assert(new TextEncoder().encode(lista).length > LIMITE_RESPOSTA_BYTES);
  const servidor = iniciarServidorFalso(() => new Response(lista));
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["GET", "/api/v1/products", null]),
    );
    assert(resultado.tipo === "erro_rede");
    assertEquals(resultado.erro, "resposta_muito_grande");
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("resposta de exatamente 2 MB passa e um byte a mais é recusado", async () => {
  for (
    const [tamanho, esperado] of [[LIMITE_RESPOSTA_BYTES, "resposta"], [
      LIMITE_RESPOSTA_BYTES + 1,
      "erro_rede",
    ]] as const
  ) {
    const servidor = iniciarServidorFalso(() => new Response("x".repeat(tamanho)));
    try {
      const resultado = await encaminharRequisicao(
        pedido(servidor.porta, ["GET", "/api/v1/users", null]),
      );
      assertEquals(resultado.tipo, esperado, String(tamanho));
    } finally {
      await servidor.encerrar();
    }
  }
});

Deno.test("destino mais lento que o tempo limite padrão de 10 s vira tempo_esgotado", async () => {
  const servidor = iniciarServidorFalso(async () => {
    await new Promise((resolver) => setTimeout(resolver, 10500));
    return new Response("[]");
  });
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["GET", "/api/v1/products", null]),
    );
    assert(resultado.tipo === "erro_rede");
    assertEquals(resultado.erro, "tempo_esgotado");
    assertGreaterOrEqual(resultado.duracaoMs, 9900);
    assert(resultado.duracaoMs < 10500, String(resultado.duracaoMs));
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("redirecionamento em rota nova não é seguido", async () => {
  const servidor = iniciarServidorFalso(() =>
    new Response(null, { status: 307, headers: { Location: "/api/v1/products/8" } })
  );
  try {
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, ["PUT", "/api/v1/products/7", CORPO_PRODUTO]),
    );
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.status, 307);
    assertEquals(resultado.cabecalhos["location"], "/api/v1/products/8");
    assertEquals(servidor.requisicoes.length, 1);
  } finally {
    await servidor.encerrar();
  }
});
