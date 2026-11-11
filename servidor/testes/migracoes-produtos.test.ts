import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const DATA_FIXA = "2026-01-01T00:00:00.000Z";

const DDL_EP1 = `
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'comum' CHECK (papel IN ('comum', 'administrador')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE sessoes (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL
);

CREATE INDEX idx_sessoes_usuario_id ON sessoes(usuario_id);
`;

type ColunaInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function comBanco(
  preparar: (conexao: ConexaoBanco) => void,
  fn: (conexao: ConexaoBanco) => void,
): void {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexao = abrirConexao(caminho);
    try {
      preparar(conexao);
      fn(conexao);
    } finally {
      fecharConexao(conexao);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
}

function nomesDoEsquema(conexao: ConexaoBanco): string[] {
  return (conexao
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    )
    .all() as { name: string }[]).map((linha) => linha.name);
}

function inserirProdutoDireto(
  conexao: ConexaoBanco,
  quantidade: unknown,
): void {
  conexao
    .prepare(
      "INSERT INTO produtos (nome, descricao, quantidade, criado_em, atualizado_em) VALUES ('Teste', '', ?, ?, ?);",
    )
    .run(quantidade as number, DATA_FIXA, DATA_FIXA);
}

Deno.test("banco novo: produtos existe com as colunas esperadas junto de usuarios e sessoes", () => {
  comBanco(executarMigracoes, (conexao) => {
    assertEquals(nomesDoEsquema(conexao), [
      "idx_sessoes_usuario_id",
      "produtos",
      "sessoes",
      "usuarios",
    ]);
    const colunas = (conexao.prepare("PRAGMA table_info(produtos);")
      .all() as ColunaInfo[]).map((coluna) => ({
        name: coluna.name,
        type: coluna.type,
        notnull: coluna.notnull,
        dflt_value: coluna.dflt_value,
        pk: coluna.pk,
      }));
    assertEquals(colunas, [
      { name: "id", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { name: "nome", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { name: "descricao", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        name: "quantidade",
        type: "INTEGER",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      { name: "criado_em", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        name: "atualizado_em",
        type: "TEXT",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
    ]);
    const sql = conexao
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'produtos';")
      .get() as { sql: string };
    assert(sql.sql.includes("AUTOINCREMENT"));
    assertEquals(
      conexao.prepare("PRAGMA index_list(produtos);").all().length,
      0,
    );
  });
});

Deno.test("banco no esquema da EP-1: produtos é criada e os dados antigos ficam intactos", () => {
  comBanco((conexao) => conexao.exec(DDL_EP1), (conexao) => {
    const inserir = conexao.prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, 'h', 's', ?, ?, ?);",
    );
    inserir.run("Ana", "ana@exemplo.com", "comum", DATA_FIXA, DATA_FIXA);
    inserir.run("Bruno", "bruno@exemplo.com", "comum", DATA_FIXA, DATA_FIXA);
    inserir.run(
      "Admin",
      "adm@teste.com",
      "administrador",
      DATA_FIXA,
      DATA_FIXA,
    );
    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES ('sessao-1', 2, ?);",
      )
      .run(DATA_FIXA);

    const lerTudo = () => ({
      usuarios: conexao.prepare("SELECT * FROM usuarios ORDER BY id;").all()
        .map((linha) => ({ ...linha })),
      sessoes: conexao.prepare("SELECT * FROM sessoes ORDER BY id;").all()
        .map((linha) => ({ ...linha })),
      esquemaUsuarios: conexao
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name IN ('usuarios', 'sessoes', 'idx_sessoes_usuario_id') ORDER BY name;",
        )
        .all()
        .map((linha) => ({ ...linha })),
    });
    const antes = lerTudo();
    assertEquals(nomesDoEsquema(conexao).includes("produtos"), false);

    executarMigracoes(conexao);
    assert(nomesDoEsquema(conexao).includes("produtos"));
    assertEquals(lerTudo(), antes);

    inserirProdutoDireto(conexao, 5);
    const esquemaDepois = nomesDoEsquema(conexao);
    const sqlProdutos = conexao
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'produtos';")
      .get();

    executarMigracoes(conexao);
    assertEquals(lerTudo(), antes);
    assertEquals(nomesDoEsquema(conexao), esquemaDepois);
    assertEquals(
      conexao
        .prepare("SELECT sql FROM sqlite_master WHERE name = 'produtos';")
        .get(),
      sqlProdutos,
    );
    const total = conexao.prepare("SELECT COUNT(*) AS total FROM produtos;")
      .get() as { total: number };
    assertEquals(total.total, 1);
  });
});

Deno.test("CHECK de quantidade rejeita -1, 1000001, 1.5 e texto não numérico", () => {
  comBanco(executarMigracoes, (conexao) => {
    for (const valor of [-1, 1000001, 1.5, 0.5, "abc", "", "10abc"]) {
      assertThrows(
        () => inserirProdutoDireto(conexao, valor),
        Error,
        "CHECK constraint failed",
        `valor ${JSON.stringify(valor)} deveria ser rejeitado`,
      );
    }
    assertThrows(
      () => inserirProdutoDireto(conexao, null),
      Error,
      "NOT NULL constraint failed",
    );
    const total = conexao.prepare("SELECT COUNT(*) AS total FROM produtos;")
      .get() as { total: number };
    assertEquals(total.total, 0);
  });
});

Deno.test("CHECK de quantidade aceita 0 e 1000000 como inteiros", () => {
  comBanco(executarMigracoes, (conexao) => {
    inserirProdutoDireto(conexao, 0);
    inserirProdutoDireto(conexao, 1000000);
    const linhas = conexao
      .prepare(
        "SELECT quantidade, typeof(quantidade) AS tipo FROM produtos ORDER BY id;",
      )
      .all()
      .map((linha) => ({ ...linha }));
    assertEquals(linhas, [
      { quantidade: 0, tipo: "integer" },
      { quantidade: 1000000, tipo: "integer" },
    ]);
  });
});

Deno.test("nome e descricao são obrigatórios, mas descricao pode ser vazia", () => {
  comBanco(executarMigracoes, (conexao) => {
    assertThrows(
      () =>
        conexao
          .prepare(
            "INSERT INTO produtos (descricao, quantidade, criado_em, atualizado_em) VALUES ('', 1, ?, ?);",
          )
          .run(DATA_FIXA, DATA_FIXA),
      Error,
      "NOT NULL constraint failed",
    );
    assertThrows(
      () =>
        conexao
          .prepare(
            "INSERT INTO produtos (nome, quantidade, criado_em, atualizado_em) VALUES ('Teste', 1, ?, ?);",
          )
          .run(DATA_FIXA, DATA_FIXA),
      Error,
      "NOT NULL constraint failed",
    );
    inserirProdutoDireto(conexao, 1);
    const linha = conexao.prepare("SELECT descricao FROM produtos;").get() as {
      descricao: string;
    };
    assertEquals(linha.descricao, "");
  });
});
