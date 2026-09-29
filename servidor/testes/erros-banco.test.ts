import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  classificarErroBanco,
  ehErroEmailDuplicado,
} from "../src/banco/erros.ts";
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

function capturarErro(fn: () => void): unknown {
  try {
    fn();
    throw new Error("A função deveria ter lançado um erro.");
  } catch (erro) {
    return erro;
  }
}

Deno.test("email duplicado classifica como unico com detalhe usuarios.email", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run("Joao", "joao@exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);

    const erro = capturarErro(() => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run("Joao2", "JOAO@Exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);
    });

    const classificado = classificarErroBanco(erro);
    assertEquals(classificado.tipo, "unico");
    assertEquals(classificado.detalhe, "usuarios.email");
    assertEquals(ehErroEmailDuplicado(erro), true);
  });
});

Deno.test("id de sessao duplicado classifica como unico mas nao e email duplicado", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run("Maria", "maria@exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);
    const usuario = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get("maria@exemplo.com") as { id: number };

    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run("sessao-1", usuario.id, DATA_FIXA);

    const erro = capturarErro(() => {
      conexao
        .prepare(
          "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
        )
        .run("sessao-1", usuario.id, DATA_FIXA);
    });

    const classificado = classificarErroBanco(erro);
    assertEquals(classificado.tipo, "unico");
    assertEquals(ehErroEmailDuplicado(erro), false);
  });
});

Deno.test("sessao com usuario_id inexistente classifica como chave_estrangeira", () => {
  comBancoDeTeste((conexao) => {
    const erro = capturarErro(() => {
      conexao
        .prepare(
          "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
        )
        .run("sessao-orfa", 999999, DATA_FIXA);
    });

    assertEquals(classificarErroBanco(erro).tipo, "chave_estrangeira");
  });
});

Deno.test("papel invalido classifica como verificacao", () => {
  comBancoDeTeste((conexao) => {
    const erro = capturarErro(() => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?);",
        )
        .run(
          "Invalido",
          "invalido@exemplo.com",
          "hash",
          "salt",
          "outro",
          DATA_FIXA,
          DATA_FIXA,
        );
    });

    assertEquals(classificarErroBanco(erro).tipo, "verificacao");
  });
});

Deno.test("nome nulo classifica como nao_nulo com detalhe usuarios.nome", () => {
  comBancoDeTeste((conexao) => {
    const erro = capturarErro(() => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(null, "semnome@exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);
    });

    const classificado = classificarErroBanco(erro);
    assertEquals(classificado.tipo, "nao_nulo");
    assertEquals(classificado.detalhe, "usuarios.nome");
  });
});

Deno.test("banco ocupado classifica como ocupado", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexaoA = abrirConexao(caminho);
    executarMigracoes(conexaoA);
    conexaoA.exec("BEGIN IMMEDIATE;");

    const conexaoB = abrirConexao(caminho);
    conexaoB.exec("PRAGMA busy_timeout = 0;");

    const erro = capturarErro(() => {
      conexaoB.exec("BEGIN IMMEDIATE;");
    });

    assertEquals(classificarErroBanco(erro).tipo, "ocupado");

    conexaoA.exec("ROLLBACK;");
    fecharConexao(conexaoB);
    fecharConexao(conexaoA);
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("valores que nao sao Error classificam como desconhecido sem lancar", () => {
  assertEquals(
    classificarErroBanco(new Error("qualquer coisa")).tipo,
    "desconhecido",
  );
  assertEquals(classificarErroBanco("erro").tipo, "desconhecido");
  assertEquals(classificarErroBanco(null).tipo, "desconhecido");
  assertEquals(classificarErroBanco(undefined).tipo, "desconhecido");
  assertEquals(classificarErroBanco({}).tipo, "desconhecido");
});
