import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import type { Registro } from "../src/estado.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  type CorpoProduto,
  verificarRespostaErro,
  verificarRespostaListaProdutos,
  verificarRespostaProduto,
  verificarRespostaSessao,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const PRODUTOS = `${API}/products`;
const MSG_NAO_ENCONTRADO = "Produto não encontrado.";
const RODADAS = 4;

async function comServidor(
  teste: (servidor: ServidorDeTeste, token: string) => Promise<void>,
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

async function criar(
  servidor: ServidorDeTeste,
  token: string,
  corpo: Record<string, unknown>,
): Promise<CorpoProduto> {
  return (await verificarRespostaProduto(
    await requisitar(servidor, "POST", PRODUTOS, { token, corpo }),
    201,
  )).corpo;
}

async function ler(
  servidor: ServidorDeTeste,
  token: string,
  id: number,
): Promise<CorpoProduto> {
  return (await verificarRespostaProduto(
    await requisitar(servidor, "GET", `${PRODUTOS}/${id}`, { token }),
    200,
  )).corpo;
}

Deno.test("30 PATCH simultâneos no mesmo produto: todos 200 e estado final coerente", async () => {
  await comServidor(async (servidor, token) => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const produto = await criar(servidor, token, {
        nome: "Base",
        descricao: "Base",
        quantidade: 1,
      });
      const corpos: Record<string, unknown>[] = Array.from(
        { length: 30 },
        (_, i) => {
          if (i % 3 === 0) {
            return { nome: `Nome ${i}` };
          }
          if (i % 3 === 1) {
            return { descricao: `Descrição ${i}` };
          }
          return { quantidade: i * 100 };
        },
      );
      const respostas = await Promise.all(
        corpos.map((corpo) =>
          requisitar(servidor, "PATCH", `${PRODUTOS}/${produto.id}`, {
            token,
            corpo,
          })
        ),
      );
      for (const resposta of respostas) {
        await verificarRespostaProduto(resposta, 200, { id: produto.id });
      }
      const final = await ler(servidor, token, produto.id);
      const nomes = corpos.flatMap((c) => c.nome === undefined ? [] : [c.nome]);
      const descricoes = corpos.flatMap((c) =>
        c.descricao === undefined ? [] : [c.descricao]
      );
      const quantidades = corpos.flatMap((c) =>
        c.quantidade === undefined ? [] : [c.quantidade]
      );
      assert(nomes.includes(final.nome), `nome ${final.nome}`);
      assert(
        descricoes.includes(final.descricao),
        `descricao ${final.descricao}`,
      );
      assert(
        quantidades.includes(final.quantidade),
        `quantidade ${final.quantidade}`,
      );
    }
  });
});

Deno.test("PATCH simultâneos de nome e de quantidade preservam os dois campos", async () => {
  await comServidor(async (servidor, token) => {
    for (let rodada = 0; rodada < RODADAS * 3; rodada++) {
      const produto = await criar(servidor, token, {
        nome: "Antes",
        descricao: "Fixa",
        quantidade: 1,
      });
      const [porNome, porQuantidade] = await Promise.all([
        requisitar(servidor, "PATCH", `${PRODUTOS}/${produto.id}`, {
          token,
          corpo: { nome: `Depois ${rodada}` },
        }),
        requisitar(servidor, "PATCH", `${PRODUTOS}/${produto.id}`, {
          token,
          corpo: { quantidade: 500 + rodada },
        }),
      ]);
      await verificarRespostaProduto(porNome, 200);
      await verificarRespostaProduto(porQuantidade, 200);
      assertEquals(await ler(servidor, token, produto.id), {
        id: produto.id,
        nome: `Depois ${rodada}`,
        descricao: "Fixa",
        quantidade: 500 + rodada,
      });
    }
  });
});

Deno.test("PUT simultâneos: o estado final é exatamente um dos corpos enviados", async () => {
  await comServidor(async (servidor, token) => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const produto = await criar(servidor, token, {
        nome: "Base",
        descricao: "Base",
        quantidade: 1,
      });
      const corpos = Array.from({ length: 12 }, (_, i) => ({
        nome: `Nome ${rodada}-${i}`,
        descricao: `Descrição ${rodada}-${i}`,
        quantidade: rodada * 1000 + i,
      }));
      const respostas = await Promise.all(
        corpos.map((corpo) =>
          requisitar(servidor, "PUT", `${PRODUTOS}/${produto.id}`, {
            token,
            corpo,
          })
        ),
      );
      for (let i = 0; i < respostas.length; i++) {
        await verificarRespostaProduto(respostas[i], 200, {
          id: produto.id,
          ...corpos[i],
        });
      }
      const final = await ler(servidor, token, produto.id);
      const { id: _id, ...semId } = final;
      assert(
        corpos.some((corpo) => JSON.stringify(corpo) === JSON.stringify(semId)),
        `estado misturado: ${JSON.stringify(final)}`,
      );
    }
  });
});

Deno.test("DELETE repetido em paralelo: exatamente um 204 e os demais 404", async () => {
  await comServidor(async (servidor, token) => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const produto = await criar(servidor, token, {
        nome: "Excluir",
        descricao: "",
        quantidade: 0,
      });
      const respostas = await Promise.all(
        Array.from(
          { length: 8 },
          () =>
            requisitar(servidor, "DELETE", `${PRODUTOS}/${produto.id}`, {
              token,
            }),
        ),
      );
      const status: number[] = [];
      for (const resposta of respostas) {
        status.push(resposta.status);
        if (resposta.status === 204) {
          await verificarRespostaVazia(resposta);
        } else {
          await verificarRespostaErro(resposta, 404, MSG_NAO_ENCONTRADO);
        }
      }
      assertEquals(status.filter((s) => s === 204).length, 1, `${status}`);
      assertEquals(status.filter((s) => s === 404).length, 7, `${status}`);
    }
  });
});

Deno.test("DELETE concorrente com PATCH, PUT e GET do mesmo produto: só 200, 204 e 404", async () => {
  await comServidor(async (servidor, token) => {
    const excluidos: number[] = [];
    for (let rodada = 0; rodada < RODADAS * 2; rodada++) {
      const produto = await criar(servidor, token, {
        nome: "Disputado",
        descricao: "",
        quantidade: 5,
      });
      const caminho = `${PRODUTOS}/${produto.id}`;
      const operacoes: [string, Promise<Response>][] = [
        [
          "PATCH",
          requisitar(servidor, "PATCH", caminho, {
            token,
            corpo: { quantidade: 9 },
          }),
        ],
        ["GET", requisitar(servidor, "GET", caminho, { token })],
        ["DELETE", requisitar(servidor, "DELETE", caminho, { token })],
        [
          "PUT",
          requisitar(servidor, "PUT", caminho, {
            token,
            corpo: { nome: "Novo", descricao: "x", quantidade: 1 },
          }),
        ],
        [
          "PATCH",
          requisitar(servidor, "PATCH", caminho, {
            token,
            corpo: { nome: "Outro" },
          }),
        ],
        ["GET", requisitar(servidor, "GET", caminho, { token })],
      ];
      for (const [metodo, promessa] of operacoes) {
        const resposta = await promessa;
        if (metodo === "DELETE") {
          await verificarRespostaVazia(resposta);
        } else if (resposta.status === 200) {
          await verificarRespostaProduto(resposta, 200, { id: produto.id });
        } else {
          await verificarRespostaErro(resposta, 404, MSG_NAO_ENCONTRADO);
        }
      }
      await verificarRespostaErro(
        await requisitar(servidor, "GET", caminho, { token }),
        404,
        MSG_NAO_ENCONTRADO,
      );
      excluidos.push(produto.id);
    }
    const lista = await verificarRespostaListaProdutos(
      await requisitar(servidor, "GET", PRODUTOS, { token }),
    );
    for (const id of excluidos) {
      assertEquals(lista.corpo.some((produto) => produto.id === id), false);
    }
  });
});

Deno.test("criação, edição e exclusão concorrentes de vários produtos: lista final confere", async () => {
  await comServidor(async (servidor, token) => {
    const existentes: CorpoProduto[] = [];
    for (let i = 0; i < 12; i++) {
      existentes.push(
        await criar(servidor, token, {
          nome: `Existente ${i}`,
          descricao: "",
          quantidade: i,
        }),
      );
    }
    const paraExcluir = existentes.filter((_, i) => i % 3 === 0);
    const paraEditar = existentes.filter((_, i) => i % 3 === 1);
    const intocados = existentes.filter((_, i) => i % 3 === 2);

    const [criacoes, edicoes, exclusoes, listagens] = await Promise.all([
      Promise.all(
        Array.from(
          { length: 10 },
          (_, i) =>
            requisitar(servidor, "POST", PRODUTOS, {
              token,
              corpo: { nome: `Novo ${i}`, descricao: "novo", quantidade: i },
            }),
        ),
      ),
      Promise.all(
        paraEditar.map((produto) =>
          requisitar(servidor, "PATCH", `${PRODUTOS}/${produto.id}`, {
            token,
            corpo: { nome: `Editado ${produto.id}`, quantidade: 777 },
          })
        ),
      ),
      Promise.all(
        paraExcluir.map((produto) =>
          requisitar(servidor, "DELETE", `${PRODUTOS}/${produto.id}`, {
            token,
          })
        ),
      ),
      Promise.all(
        Array.from(
          { length: 8 },
          () => requisitar(servidor, "GET", PRODUTOS, { token }),
        ),
      ),
    ]);

    const novos: CorpoProduto[] = [];
    for (const resposta of criacoes) {
      novos.push((await verificarRespostaProduto(resposta, 201)).corpo);
    }
    for (const resposta of edicoes) {
      await verificarRespostaProduto(resposta, 200, { quantidade: 777 });
    }
    for (const resposta of exclusoes) {
      await verificarRespostaVazia(resposta);
    }
    for (const resposta of listagens) {
      const lida = await verificarRespostaListaProdutos(resposta);
      const ids = lida.corpo.map((produto) => produto.id);
      assertEquals(new Set(ids).size, ids.length);
    }

    const esperado = [
      ...intocados,
      ...paraEditar.map((produto) => ({
        ...produto,
        nome: `Editado ${produto.id}`,
        quantidade: 777,
      })),
      ...novos,
    ].sort((a, b) => a.id - b.id);
    const final = await verificarRespostaListaProdutos(
      await requisitar(servidor, "GET", PRODUTOS, { token }),
    );
    assertEquals(final.corpo, esperado);
    for (const produto of paraExcluir) {
      assertEquals(final.corpo.some((p) => p.id === produto.id), false);
    }
  });
});
