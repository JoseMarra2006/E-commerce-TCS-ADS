import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import type { Registro } from "../src/estado.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  type CorpoProduto,
  verificarCors,
  verificarRespostaErro,
  verificarRespostaListaProdutos,
  verificarRespostaProduto,
  verificarRespostaSessao,
} from "./auxiliares/conformidade.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const PRODUTOS = `${API}/products`;

async function comServidor(
  teste: (servidor: ServidorDeTeste, tokenAdm: string) => Promise<void>,
): Promise<void> {
  const servidor = await iniciarServidorDeTeste();
  try {
    const login = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
      }),
    );
    await teste(servidor, login.corpo.token);
    conferirSemFalhas(servidor.registros);
  } finally {
    await servidor.encerrar();
  }
}

function conferirSemFalhas(registros: Registro[]): void {
  assertEquals(
    registros.filter((r) => r.tipo === "requisicao" && r.status === 500),
    [],
  );
  assertEquals(
    registros.filter((r) => r.tipo === "sistema" && r.nivel === "erro"),
    [],
  );
}

Deno.test("50 POST simultâneos do ADM com leituras em paralelo: ids únicos, listas ordenadas e nenhum 500", async () => {
  await comServidor(async (servidor, tokenAdm) => {
    const total = 50;
    const criacoes = Array.from(
      { length: total },
      (_, i) =>
        requisitar(servidor, "POST", PRODUTOS, {
          token: tokenAdm,
          corpo: {
            nome: `Ingresso ${i}`,
            descricao: `Lote ${i}`,
            quantidade: i,
          },
        }),
    );
    const listagens = Array.from(
      { length: 15 },
      () => requisitar(servidor, "GET", PRODUTOS, { token: tokenAdm }),
    );
    const leiturasPorId = Array.from(
      { length: 20 },
      (_, i) =>
        requisitar(servidor, "GET", `${PRODUTOS}/${i + 1}`, {
          token: tokenAdm,
        }),
    );

    const [respostasCriacao, respostasLista, respostasId] = await Promise.all([
      Promise.all(criacoes),
      Promise.all(listagens),
      Promise.all(leiturasPorId),
    ]);

    const criados: CorpoProduto[] = [];
    for (const resposta of respostasCriacao) {
      const location = resposta.headers.get("Location");
      const lida = await verificarRespostaProduto(resposta, 201);
      assertEquals(location, `${PRODUTOS}/${lida.corpo.id}`);
      criados.push(lida.corpo);
    }
    const ids = criados.map((produto) => produto.id);
    assertEquals(new Set(ids).size, total);

    for (const resposta of respostasLista) {
      const lida = await verificarRespostaListaProdutos(resposta);
      const idsLista = lida.corpo.map((produto) => produto.id);
      assertEquals(new Set(idsLista).size, idsLista.length);
      assert(idsLista.length <= total);
    }

    for (const resposta of respostasId) {
      if (resposta.status === 200) {
        await verificarRespostaProduto(resposta, 200);
      } else {
        await verificarRespostaErro(resposta, 404, "Produto não encontrado.");
      }
    }

    const final = await verificarRespostaListaProdutos(
      await requisitar(servidor, "GET", PRODUTOS, { token: tokenAdm }),
    );
    assertEquals(final.corpo, [...criados].sort((a, b) => a.id - b.id));
    assertEquals(
      new Set(final.corpo.map((produto) => produto.nome)).size,
      total,
    );

    const threads = new Set(
      servidor.registros
        .filter((r) => r.tipo === "requisicao" && r.caminho === PRODUTOS)
        .map((r) => r.tipo === "requisicao" ? r.thread : null),
    );
    assert(threads.size >= 2, `threads distintas: ${threads.size}`);
  });
});

Deno.test("POST /products aparece no log com o corpo legível e sem erro", async () => {
  await comServidor(async (servidor, tokenAdm) => {
    const resposta = await requisitar(servidor, "POST", PRODUTOS, {
      token: tokenAdm,
      corpo: { nome: "Caneca Térmica", descricao: "Aço ☕", quantidade: 7 },
    });
    verificarCors(resposta);
    const lida = await verificarRespostaProduto(resposta, 201);

    const listagem = await requisitar(servidor, "GET", PRODUTOS, {
      token: tokenAdm,
    });
    await verificarRespostaListaProdutos(listagem);

    const registroPost = servidor.registros.find(
      (r) =>
        r.tipo === "requisicao" && r.metodo === "POST" &&
        r.caminho === PRODUTOS,
    );
    assert(registroPost !== undefined && registroPost.tipo === "requisicao");
    assertEquals(registroPost.status, 201);
    assert(registroPost.thread !== null);
    assert(registroPost.corpoRecebido !== null);
    assertEquals(JSON.parse(registroPost.corpoRecebido), {
      nome: "Caneca Térmica",
      descricao: "Aço ☕",
      quantidade: 7,
    });
    assert(registroPost.corpoEnviado !== null);
    assertEquals(JSON.parse(registroPost.corpoEnviado), lida.corpo);

    const registroLista = servidor.registros.find(
      (r) =>
        r.tipo === "requisicao" && r.metodo === "GET" &&
        r.caminho === PRODUTOS,
    );
    assert(registroLista !== undefined && registroLista.tipo === "requisicao");
    assertEquals(registroLista.status, 200);
    assert(registroLista.corpoEnviado !== null);
    assertEquals(JSON.parse(registroLista.corpoEnviado), [lida.corpo]);
  });
});

Deno.test("lista grande de produtos é truncada no log, mas chega inteira ao cliente", async () => {
  await comServidor(async (servidor, tokenAdm) => {
    const descricao = "d".repeat(500);
    for (let i = 0; i < 15; i++) {
      const resposta = await requisitar(servidor, "POST", PRODUTOS, {
        token: tokenAdm,
        corpo: { nome: `Produto ${i}`, descricao, quantidade: i },
      });
      assertEquals(resposta.status, 201);
      await resposta.body?.cancel();
    }
    const lida = await verificarRespostaListaProdutos(
      await requisitar(servidor, "GET", PRODUTOS, { token: tokenAdm }),
    );
    assertEquals(lida.corpo.length, 15);
    assert(lida.texto.length > 5000);

    const registro = servidor.registros.filter(
      (r) =>
        r.tipo === "requisicao" && r.metodo === "GET" &&
        r.caminho === PRODUTOS,
    ).at(-1);
    assert(registro !== undefined && registro.tipo === "requisicao");
    assert(registro.corpoEnviado !== null);
    assert(registro.corpoEnviado.endsWith(" (truncado)"));
    assert(registro.corpoEnviado.length < lida.texto.length);
  });
});
