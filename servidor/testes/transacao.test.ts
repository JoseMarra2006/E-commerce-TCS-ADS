import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { executarTransacao } from "../src/banco/transacao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const DATA_FIXA = "2026-01-01T00:00:00.000Z";

function comBancoDeTeste(
  fn: (conexao: ReturnType<typeof abrirConexao>) => void,
): void {
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

function contarUsuarios(conexao: ReturnType<typeof abrirConexao>): number {
  const linha = conexao.prepare("SELECT COUNT(*) AS total FROM usuarios;")
    .get() as {
      total: number;
    };
  return linha.total;
}

Deno.test("transacao confirmada grava o registro e devolve o resultado", () => {
  comBancoDeTeste((conexao) => {
    const resultado = executarTransacao(conexao, () => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(
          "Confirmado",
          "confirmado@exemplo.com",
          "hash",
          "salt",
          DATA_FIXA,
          DATA_FIXA,
        );
      return 42;
    });

    assertEquals(resultado, 42);
    assertEquals(contarUsuarios(conexao), 1);
  });
});

Deno.test("transacao desfeita nao grava e relanca o mesmo erro", () => {
  comBancoDeTeste((conexao) => {
    const erroOriginal = new Error("falha proposital");

    const erroCapturado = assertThrows(() => {
      executarTransacao(conexao, () => {
        conexao
          .prepare(
            "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
          )
          .run(
            "Desfeito",
            "desfeito@exemplo.com",
            "hash",
            "salt",
            DATA_FIXA,
            DATA_FIXA,
          );
        throw erroOriginal;
      });
    });

    assert(erroCapturado === erroOriginal);
    assertEquals(contarUsuarios(conexao), 0);
  });
});

Deno.test("erro de violacao unique nao e repetido", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Existente",
        "existente@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    let chamadas = 0;

    assertThrows(() => {
      executarTransacao(conexao, () => {
        chamadas++;
        conexao
          .prepare(
            "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
          )
          .run(
            "Duplicado",
            "existente@exemplo.com",
            "hash",
            "salt",
            DATA_FIXA,
            DATA_FIXA,
          );
        return 1;
      });
    });

    assertEquals(chamadas, 1);
  });
});

Deno.test("transacao aninhada lanca erro e transacao externa e desfeita, permitindo uso posterior", () => {
  comBancoDeTeste((conexao) => {
    assertThrows(
      () => {
        executarTransacao(conexao, () => {
          conexao
            .prepare(
              "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
            )
            .run(
              "Externo",
              "externo@exemplo.com",
              "hash",
              "salt",
              DATA_FIXA,
              DATA_FIXA,
            );
          executarTransacao(conexao, () => 1);
          return 1;
        });
      },
      Error,
      "Transações aninhadas não são permitidas.",
    );

    assertEquals(contarUsuarios(conexao), 0);

    const resultado = executarTransacao(conexao, () => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(
          "Depois",
          "depois@exemplo.com",
          "hash",
          "salt",
          DATA_FIXA,
          DATA_FIXA,
        );
      return "ok";
    });

    assertEquals(resultado, "ok");
    assertEquals(contarUsuarios(conexao), 1);
  });
});

Deno.test("operacao assincrona lanca erro, nao grava e a conexao continua utilizavel", () => {
  comBancoDeTeste((conexao) => {
    const operacaoAssincrona = (() => Promise.resolve(1)) as unknown as () =>
      number;

    assertThrows(
      () => {
        executarTransacao(conexao, operacaoAssincrona);
      },
      Error,
      "A operação de uma transação não pode ser assíncrona.",
    );

    assertEquals(contarUsuarios(conexao), 0);

    const resultado = executarTransacao(conexao, () => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(
          "Sincrono",
          "sincrono@exemplo.com",
          "hash",
          "salt",
          DATA_FIXA,
          DATA_FIXA,
        );
      return "ok";
    });

    assertEquals(resultado, "ok");
    assertEquals(contarUsuarios(conexao), 1);
  });
});

Deno.test("banco ocupado sem liberacao esgota tentativas sem executar a operacao", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexaoA = abrirConexao(caminho);
    executarMigracoes(conexaoA);
    conexaoA.exec("BEGIN IMMEDIATE;");

    const conexaoB = abrirConexao(caminho);
    conexaoB.exec("PRAGMA busy_timeout = 0;");

    let chamadas = 0;

    assertThrows(() => {
      executarTransacao(conexaoB, () => {
        chamadas++;
        return 1;
      });
    });

    assertEquals(chamadas, 0);

    conexaoA.exec("ROLLBACK;");
    fecharConexao(conexaoB);
    fecharConexao(conexaoA);
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("apos a liberacao do bloqueio a transacao funciona", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexaoA = abrirConexao(caminho);
    executarMigracoes(conexaoA);
    conexaoA.exec("BEGIN IMMEDIATE;");
    conexaoA.exec("COMMIT;");

    const conexaoB = abrirConexao(caminho);
    conexaoB.exec("PRAGMA busy_timeout = 0;");

    const resultado = executarTransacao(conexaoB, () => {
      conexaoB
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(
          "Liberado",
          "liberado@exemplo.com",
          "hash",
          "salt",
          DATA_FIXA,
          DATA_FIXA,
        );
      return "ok";
    });

    assertEquals(resultado, "ok");

    fecharConexao(conexaoB);
    fecharConexao(conexaoA);
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("atualizacao condicional de estoque impede reserva duplicada", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexaoA = abrirConexao(caminho);
    executarMigracoes(conexaoA);
    conexaoA.exec(
      "CREATE TABLE estoque_teste (id INTEGER PRIMARY KEY, quantidade INTEGER NOT NULL CHECK (quantidade >= 0));",
    );
    conexaoA.prepare(
      "INSERT INTO estoque_teste (id, quantidade) VALUES (1, 1);",
    ).run();

    const conexaoB = abrirConexao(caminho);

    const reservar = (conexao: ReturnType<typeof abrirConexao>): number => {
      return executarTransacao(conexao, () => {
        const resultado = conexao
          .prepare(
            "UPDATE estoque_teste SET quantidade = quantidade - 1 WHERE id = 1 AND quantidade >= 1;",
          )
          .run();
        return Number(resultado.changes);
      });
    };

    const primeiraReserva = reservar(conexaoA);
    const segundaReserva = reservar(conexaoB);

    assertEquals(primeiraReserva, 1);
    assertEquals(segundaReserva, 0);

    const quantidadeFinal = conexaoA
      .prepare("SELECT quantidade FROM estoque_teste WHERE id = 1;")
      .get() as { quantidade: number };
    assertEquals(quantidadeFinal.quantidade, 0);

    fecharConexao(conexaoB);
    fecharConexao(conexaoA);
  } finally {
    removerBancoTemporario(caminho);
  }
});
