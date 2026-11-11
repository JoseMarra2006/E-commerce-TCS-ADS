import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  atualizarProduto,
  buscarProdutoPorId,
  criarProduto,
  excluirProduto,
  listarProdutos,
} from "../src/modulos/produtos/repositorio-produtos.ts";
import type { ProdutoRegistro } from "../src/modulos/produtos/tipos-produtos.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const PADRAO_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function comBancoDeTeste(fn: (conexao: ConexaoBanco) => void): void {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexao = abrirConexao(caminho);
    try {
      executarMigracoes(conexao);
      fn(conexao);
    } finally {
      fecharConexao(conexao);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
}

function criar(
  conexao: ConexaoBanco,
  nome: string,
  quantidade = 10,
  descricao = "Descrição",
): ProdutoRegistro {
  return criarProduto(conexao, { nome, descricao, quantidade });
}

function esperarMilissegundo(): void {
  const inicio = Date.now();
  while (Date.now() === inicio) {
    continue;
  }
}

Deno.test("criarProduto devolve o registro completo, aceitando descrição vazia", () => {
  comBancoDeTeste((conexao) => {
    const produto = criarProduto(conexao, {
      nome: "Ingresso VIP",
      descricao: "",
      quantidade: 0,
    });
    assert(Number.isInteger(produto.id) && produto.id > 0);
    assertEquals(produto.nome, "Ingresso VIP");
    assertEquals(produto.descricao, "");
    assertEquals(produto.quantidade, 0);
    assert(PADRAO_ISO.test(produto.criadoEm));
    assertEquals(produto.atualizadoEm, produto.criadoEm);
    assertEquals(Object.keys(produto), [
      "id",
      "nome",
      "descricao",
      "quantidade",
      "criadoEm",
      "atualizadoEm",
    ]);
    assertEquals(buscarProdutoPorId(conexao, produto.id), produto);
  });
});

Deno.test("ids são crescentes e nunca reutilizados após exclusão", () => {
  comBancoDeTeste((conexao) => {
    const a = criar(conexao, "A");
    const b = criar(conexao, "B");
    assert(b.id > a.id);
    assert(excluirProduto(conexao, b.id));
    const c = criar(conexao, "C");
    assert(c.id > b.id);
    assert(excluirProduto(conexao, a.id));
    assert(excluirProduto(conexao, c.id));
    const d = criar(conexao, "D");
    assert(d.id > c.id);
  });
});

Deno.test("buscarProdutoPorId devolve o existente e undefined para o inexistente", () => {
  comBancoDeTeste((conexao) => {
    const produto = criar(conexao, "Camiseta", 3, "Algodão");
    assertEquals(buscarProdutoPorId(conexao, produto.id), produto);
    assertEquals(buscarProdutoPorId(conexao, produto.id + 1), undefined);
    assertEquals(buscarProdutoPorId(conexao, 999999), undefined);
  });
});

Deno.test("listarProdutos devolve array vazio sem produtos", () => {
  comBancoDeTeste((conexao) => {
    assertEquals(listarProdutos(conexao), []);
  });
});

Deno.test("listarProdutos ordena por id mesmo com inserção fora de ordem", () => {
  comBancoDeTeste((conexao) => {
    const inserir = conexao.prepare(
      "INSERT INTO produtos (id, nome, descricao, quantidade, criado_em, atualizado_em) VALUES (?, ?, '', 1, 'agora', 'agora');",
    );
    inserir.run(30, "Trinta");
    inserir.run(7, "Sete");
    inserir.run(19, "Dezenove");
    assertEquals(
      listarProdutos(conexao).map((produto) => [produto.id, produto.nome]),
      [[7, "Sete"], [19, "Dezenove"], [30, "Trinta"]],
    );
    const novo = criar(conexao, "Novo");
    assertEquals(novo.id, 31);
  });
});

Deno.test("listarProdutos continua em ordem após exclusão no meio", () => {
  comBancoDeTeste((conexao) => {
    const produtos = ["A", "B", "C", "D"].map((nome) => criar(conexao, nome));
    assert(excluirProduto(conexao, produtos[1].id));
    assertEquals(listarProdutos(conexao), [
      produtos[0],
      produtos[2],
      produtos[3],
    ]);
  });
});

Deno.test("atualizarProduto altera cada campo isolado e mantém os demais", () => {
  comBancoDeTeste((conexao) => {
    const original = criar(conexao, "Caneca", 5, "Cerâmica");

    const nome = atualizarProduto(conexao, original.id, {
      nome: "Caneca Azul",
    });
    assertEquals(nome?.nome, "Caneca Azul");
    assertEquals(nome?.descricao, "Cerâmica");
    assertEquals(nome?.quantidade, 5);

    const descricao = atualizarProduto(conexao, original.id, {
      descricao: "",
    });
    assertEquals(descricao?.nome, "Caneca Azul");
    assertEquals(descricao?.descricao, "");
    assertEquals(descricao?.quantidade, 5);

    const quantidade = atualizarProduto(conexao, original.id, {
      quantidade: 0,
    });
    assertEquals(quantidade?.nome, "Caneca Azul");
    assertEquals(quantidade?.descricao, "");
    assertEquals(quantidade?.quantidade, 0);

    assertEquals(buscarProdutoPorId(conexao, original.id), quantidade);
  });
});

Deno.test("atualizarProduto altera vários campos e só o produto alvo", () => {
  comBancoDeTeste((conexao) => {
    const alvo = criar(conexao, "Alvo", 1, "Antes");
    const outro = criar(conexao, "Outro", 2, "Intacto");
    const atualizado = atualizarProduto(conexao, alvo.id, {
      nome: "Alvo Novo",
      descricao: "Depois",
      quantidade: 1000000,
    });
    assertEquals(atualizado, {
      id: alvo.id,
      nome: "Alvo Novo",
      descricao: "Depois",
      quantidade: 1000000,
      criadoEm: alvo.criadoEm,
      atualizadoEm: atualizado?.atualizadoEm ?? "",
    });
    assertEquals(buscarProdutoPorId(conexao, outro.id), outro);
  });
});

Deno.test("atualizarProduto muda atualizado_em e preserva criado_em", () => {
  comBancoDeTeste((conexao) => {
    const original = criar(conexao, "Relógio");
    esperarMilissegundo();
    const atualizado = atualizarProduto(conexao, original.id, {
      quantidade: 9,
    });
    assert(atualizado !== undefined);
    assertEquals(atualizado.criadoEm, original.criadoEm);
    assertNotEquals(atualizado.atualizadoEm, original.atualizadoEm);
    assert(atualizado.atualizadoEm > original.atualizadoEm);
    assert(PADRAO_ISO.test(atualizado.atualizadoEm));
  });
});

Deno.test("atualizarProduto devolve undefined para id inexistente sem criar nada", () => {
  comBancoDeTeste((conexao) => {
    assertEquals(
      atualizarProduto(conexao, 999999, { nome: "Fantasma" }),
      undefined,
    );
    assertEquals(listarProdutos(conexao), []);
  });
});

Deno.test("excluirProduto devolve true na primeira vez e false depois ou para inexistente", () => {
  comBancoDeTeste((conexao) => {
    const produto = criar(conexao, "Mochila");
    const outro = criar(conexao, "Boné");
    assertEquals(excluirProduto(conexao, produto.id), true);
    assertEquals(excluirProduto(conexao, produto.id), false);
    assertEquals(excluirProduto(conexao, 999999), false);
    assertEquals(buscarProdutoPorId(conexao, produto.id), undefined);
    assertEquals(listarProdutos(conexao), [outro]);
  });
});

Deno.test("acentos e emoji em nome e descricao são gravados e lidos sem alteração", () => {
  comBancoDeTeste((conexao) => {
    const nome = "Café ☕ Ação 🎟️";
    const descricao = "Pão de queijo, açaí e 🇧🇷 — edição limitada ç ü ñ";
    const produto = criar(conexao, nome, 7, descricao);
    assertEquals(produto.nome, nome);
    assertEquals(produto.descricao, descricao);
    const lido = buscarProdutoPorId(conexao, produto.id);
    assertEquals(lido?.nome, nome);
    assertEquals(lido?.descricao, descricao);
    const atualizado = atualizarProduto(conexao, produto.id, {
      descricao: `${descricao} ✅`,
    });
    assertEquals(atualizado?.descricao, `${descricao} ✅`);
    assertEquals(listarProdutos(conexao)[0].nome, nome);
  });
});

Deno.test("duas conexões ao mesmo banco alternando criações não perdem registros nem repetem ids", () => {
  const caminho = criarCaminhoBancoTemporario();
  const primeira = abrirConexao(caminho);
  const segunda = abrirConexao(caminho);
  try {
    executarMigracoes(primeira);
    const ids: number[] = [];
    for (let i = 0; i < 40; i++) {
      const conexao = i % 2 === 0 ? primeira : segunda;
      ids.push(criar(conexao, `Alternado ${i}`, i).id);
      const outra = conexao === primeira ? segunda : primeira;
      assertEquals(buscarProdutoPorId(outra, ids[i])?.nome, `Alternado ${i}`);
    }
    assertEquals(new Set(ids).size, 40);
    assertEquals(listarProdutos(segunda).map((produto) => produto.id), ids);
  } finally {
    fecharConexao(primeira);
    fecharConexao(segunda);
    removerBancoTemporario(caminho);
  }
});

Deno.test("criações em paralelo real por trabalhadores com conexões próprias não perdem registros", async () => {
  const caminho = criarCaminhoBancoTemporario();
  const preparacao = abrirConexao(caminho);
  try {
    executarMigracoes(preparacao);
  } finally {
    fecharConexao(preparacao);
  }

  const prefixos = ["a", "b", "c", "d"];
  const porTrabalhador = 30;

  try {
    const resultados = await Promise.all(
      prefixos.map((prefixo) =>
        new Promise<{ ok: boolean; ids?: number[]; mensagem?: string }>(
          (resolve, reject) => {
            const worker = new Worker(
              new URL(
                "./auxiliares/trabalhador-produtos-teste.ts",
                import.meta.url,
              ).href,
              { type: "module" },
            );
            worker.onmessage = (evento: MessageEvent<unknown>) => {
              worker.terminate();
              resolve(
                evento.data as {
                  ok: boolean;
                  ids?: number[];
                  mensagem?: string;
                },
              );
            };
            worker.onerror = (evento: ErrorEvent) => {
              evento.preventDefault();
              worker.terminate();
              reject(new Error(evento.message));
            };
            worker.postMessage({
              caminhoBanco: caminho,
              prefixo,
              quantidade: porTrabalhador,
            });
          },
        )
      ),
    );

    const todosIds: number[] = [];
    for (const resultado of resultados) {
      assertEquals(resultado.ok, true, resultado.mensagem);
      todosIds.push(...(resultado.ids ?? []));
    }
    assertEquals(todosIds.length, prefixos.length * porTrabalhador);
    assertEquals(new Set(todosIds).size, todosIds.length);

    const verificacao = abrirConexao(caminho);
    try {
      const lista = listarProdutos(verificacao);
      assertEquals(lista.length, prefixos.length * porTrabalhador);
      assertEquals(
        lista.map((produto) => produto.id),
        [...todosIds].sort((x, y) => x - y),
      );
      for (const prefixo of prefixos) {
        assertEquals(
          lista.filter((produto) => produto.nome.startsWith(`${prefixo}-`))
            .length,
          porTrabalhador,
        );
      }
    } finally {
      fecharConexao(verificacao);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
});
