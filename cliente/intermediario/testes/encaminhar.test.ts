import { assert, assertEquals, assertFalse } from "@std/assert";
import { encaminharRequisicao } from "../src/encaminhar.ts";
import type { ResultadoEnvio } from "../src/encaminhar.ts";
import type { PedidoEnvio } from "../src/pedido-envio.ts";
import { iniciarServidorFalso, obterPortaLivre } from "./auxiliares.ts";

function pedido(porta: number, extra: Partial<PedidoEnvio> = {}): PedidoEnvio {
  return {
    ip: "127.0.0.1",
    porta,
    metodo: "POST",
    caminho: "/api/v1/users",
    token: null,
    corpo: null,
    ...extra,
  };
}

function conferirMetricas(resultado: ResultadoEnvio): void {
  assert(resultado.url.startsWith("http://"));
  assert(typeof resultado.duracaoMs === "number" && resultado.duracaoMs >= 0);
}

Deno.test("entrega método, caminho, corpo e cabeçalhos exatamente como definidos", async () => {
  const servidor = iniciarServidorFalso(() => new Response("{}", { status: 201 }));
  try {
    const corpo = '{"nome":"José","email":"a@b.co","senha":"abc123"}';
    const resultado = await encaminharRequisicao(
      pedido(servidor.porta, { token: "tok.en.xyz", corpo }),
    );
    conferirMetricas(resultado);
    const recebida = servidor.requisicoes[0];
    assert(recebida !== undefined);
    assertEquals(recebida.metodo, "POST");
    assertEquals(recebida.caminho, "/api/v1/users");
    assertEquals(recebida.corpo, new TextEncoder().encode(corpo));
    assertEquals(recebida.cabecalhos.get("content-type"), "application/json");
    assertEquals(recebida.cabecalhos.get("authorization"), "Bearer tok.en.xyz");
    assertEquals(recebida.cabecalhos.get("origin"), null);
    assertEquals(recebida.cabecalhos.get("cookie"), null);
    assertEquals(recebida.cabecalhos.get("x-token-intermediario"), null);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("GET sem token não envia Authorization nem Content-Type", async () => {
  const servidor = iniciarServidorFalso(() => new Response("{}"));
  try {
    await encaminharRequisicao(
      pedido(servidor.porta, { metodo: "GET", caminho: "/api/v1/users/1" }),
    );
    const recebida = servidor.requisicoes[0];
    assert(recebida !== undefined);
    assertEquals(recebida.metodo, "GET");
    assertEquals(recebida.cabecalhos.get("authorization"), null);
    assertEquals(recebida.cabecalhos.get("content-type"), null);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("preserva status, nomes minúsculos de cabeçalhos e corpo de cada resposta", async () => {
  const respostas = new Map<string, Response>();
  const servidor = iniciarServidorFalso((requisicao) => {
    const caminho = new URL(requisicao.url).pathname;
    return respostas.get(caminho)?.clone() ?? new Response("sem rota", { status: 404 });
  });
  try {
    for (const codigo of [201, 400, 401, 403, 404, 405, 409, 500]) {
      respostas.set(
        `/api/v1/r${codigo}`,
        new Response(`{"mensagem":"m${codigo}"}`, {
          status: codigo,
          headers: { "X-Meu-Cabecalho": "Valor Misto", "Content-Type": "application/json" },
        }),
      );
      const resultado = await encaminharRequisicao(
        pedido(servidor.porta, { metodo: "GET", caminho: `/api/v1/r${codigo}` }),
      );
      assert(resultado.tipo === "resposta");
      assertEquals(resultado.status, codigo);
      assertEquals(resultado.corpo, `{"mensagem":"m${codigo}"}`);
      assertEquals(resultado.cabecalhos["x-meu-cabecalho"], "Valor Misto");
      assertEquals(resultado.cabecalhos["content-type"], "application/json");
      assertFalse("X-Meu-Cabecalho" in resultado.cabecalhos);
    }

    respostas.set("/api/v1/r204", new Response(null, { status: 204 }));
    const vazio = await encaminharRequisicao(
      pedido(servidor.porta, { metodo: "DELETE", caminho: "/api/v1/r204" }),
    );
    assert(vazio.tipo === "resposta");
    assertEquals(vazio.status, 204);
    assertEquals(vazio.corpo, "");

    respostas.set("/api/v1/texto", new Response("<html>não é JSON</html>", { status: 502 }));
    const texto = await encaminharRequisicao(
      pedido(servidor.porta, { metodo: "GET", caminho: "/api/v1/texto" }),
    );
    assert(texto.tipo === "resposta");
    assertEquals(texto.status, 502);
    assertEquals(texto.corpo, "<html>não é JSON</html>");
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("não segue redirecionamentos", async () => {
  const servidor = iniciarServidorFalso(() =>
    new Response(null, { status: 302, headers: { Location: "/api/v1/outro" } })
  );
  try {
    const resultado = await encaminharRequisicao(pedido(servidor.porta, { metodo: "GET" }));
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.status, 302);
    assertEquals(resultado.cabecalhos["location"], "/api/v1/outro");
    assertEquals(servidor.requisicoes.length, 1);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("funciona com servidor sem nenhum cabeçalho CORS", async () => {
  const servidor = iniciarServidorFalso(() => new Response('{"ok":true}'));
  try {
    const resultado = await encaminharRequisicao(pedido(servidor.porta, { metodo: "GET" }));
    assert(resultado.tipo === "resposta");
    assertEquals(resultado.status, 200);
    assertEquals(resultado.cabecalhos["access-control-allow-origin"], undefined);
    assertEquals(resultado.corpo, '{"ok":true}');
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("porta fechada resulta em conexao_recusada", async () => {
  const resultado = await encaminharRequisicao(pedido(obterPortaLivre()));
  assertEquals(resultado.tipo, "erro_rede");
  assert(resultado.tipo === "erro_rede");
  assertEquals(resultado.erro, "conexao_recusada");
  conferirMetricas(resultado);
});

Deno.test("servidor lento resulta em tempo_esgotado", async () => {
  const servidor = iniciarServidorFalso(async () => {
    await new Promise((resolver) => setTimeout(resolver, 1500));
    return new Response("tarde");
  });
  try {
    const resultado = await encaminharRequisicao(pedido(servidor.porta, { metodo: "GET" }), {
      tempoLimiteMs: 300,
    });
    assert(resultado.tipo === "erro_rede");
    assertEquals(resultado.erro, "tempo_esgotado");
    conferirMetricas(resultado);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("nome de host inexistente resulta em endereco_nao_encontrado", async () => {
  const resultado = await encaminharRequisicao(
    pedido(20000, { ip: "host-inexistente.invalid", metodo: "GET" }),
  );
  assert(resultado.tipo === "erro_rede");
  assertEquals(resultado.erro, "endereco_nao_encontrado");
  conferirMetricas(resultado);
});

Deno.test("resposta maior que o limite resulta em resposta_muito_grande", async () => {
  const servidor = iniciarServidorFalso(() => new Response("x".repeat(5000)));
  try {
    const resultado = await encaminharRequisicao(pedido(servidor.porta, { metodo: "GET" }), {
      tamanhoMaximoRespostaBytes: 1000,
    });
    assert(resultado.tipo === "erro_rede");
    assertEquals(resultado.erro, "resposta_muito_grande");
    conferirMetricas(resultado);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("porta bloqueada pelo runtime resulta em falha_rede sem lançar exceção", async () => {
  const resultado = await encaminharRequisicao(pedido(1, { metodo: "GET" }));
  assert(resultado.tipo === "erro_rede");
  assertEquals(resultado.erro, "falha_rede");
  conferirMetricas(resultado);
});
