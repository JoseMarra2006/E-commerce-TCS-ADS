import { assert, assertEquals, assertThrows } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const DATA_FIXA = "2026-01-01T00:00:00.000Z";

type ColunaInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type ChaveEstrangeiraInfo = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
};

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

Deno.test("executarMigracoes cria as tabelas e o indice", () => {
  comBancoDeTeste((conexao) => {
    const nomes = conexao
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index');",
      )
      .all() as { name: string }[];
    const nomesEncontrados = nomes.map((linha) => linha.name);
    assert(nomesEncontrados.includes("usuarios"));
    assert(nomesEncontrados.includes("sessoes"));
    assert(nomesEncontrados.includes("idx_sessoes_usuario_id"));
  });
});

Deno.test("colunas de usuarios estao corretas", () => {
  comBancoDeTeste((conexao) => {
    const colunas = conexao.prepare("PRAGMA table_info(usuarios);")
      .all() as ColunaInfo[];
    assertEquals(colunas.length, 8);

    const porNome = new Map(colunas.map((coluna) => [coluna.name, coluna]));

    const id = porNome.get("id");
    assert(id !== undefined);
    assertEquals(id.type, "INTEGER");
    assertEquals(id.pk, 1);

    const nome = porNome.get("nome");
    assert(nome !== undefined);
    assertEquals(nome.type, "TEXT");
    assertEquals(nome.notnull, 1);
    assertEquals(nome.pk, 0);

    const email = porNome.get("email");
    assert(email !== undefined);
    assertEquals(email.type, "TEXT");
    assertEquals(email.notnull, 1);

    const senhaHash = porNome.get("senha_hash");
    assert(senhaHash !== undefined);
    assertEquals(senhaHash.type, "TEXT");
    assertEquals(senhaHash.notnull, 1);

    const senhaSalt = porNome.get("senha_salt");
    assert(senhaSalt !== undefined);
    assertEquals(senhaSalt.type, "TEXT");
    assertEquals(senhaSalt.notnull, 1);

    const papel = porNome.get("papel");
    assert(papel !== undefined);
    assertEquals(papel.type, "TEXT");
    assertEquals(papel.notnull, 1);
    assertEquals(papel.dflt_value, "'comum'");

    const criadoEm = porNome.get("criado_em");
    assert(criadoEm !== undefined);
    assertEquals(criadoEm.type, "TEXT");
    assertEquals(criadoEm.notnull, 1);

    const atualizadoEm = porNome.get("atualizado_em");
    assert(atualizadoEm !== undefined);
    assertEquals(atualizadoEm.type, "TEXT");
    assertEquals(atualizadoEm.notnull, 1);
  });
});

Deno.test("colunas de sessoes e chave estrangeira estao corretas", () => {
  comBancoDeTeste((conexao) => {
    const colunas = conexao.prepare("PRAGMA table_info(sessoes);")
      .all() as ColunaInfo[];
    assertEquals(colunas.length, 3);

    const porNome = new Map(colunas.map((coluna) => [coluna.name, coluna]));

    const id = porNome.get("id");
    assert(id !== undefined);
    assertEquals(id.type, "TEXT");
    assertEquals(id.pk, 1);

    const usuarioId = porNome.get("usuario_id");
    assert(usuarioId !== undefined);
    assertEquals(usuarioId.type, "INTEGER");
    assertEquals(usuarioId.notnull, 1);

    const criadoEm = porNome.get("criado_em");
    assert(criadoEm !== undefined);
    assertEquals(criadoEm.type, "TEXT");
    assertEquals(criadoEm.notnull, 1);

    const chavesEstrangeiras = conexao
      .prepare("PRAGMA foreign_key_list(sessoes);")
      .all() as ChaveEstrangeiraInfo[];
    assertEquals(chavesEstrangeiras.length, 1);
    assertEquals(chavesEstrangeiras[0].table, "usuarios");
    assertEquals(chavesEstrangeiras[0].from, "usuario_id");
    assertEquals(chavesEstrangeiras[0].to, "id");
    assertEquals(chavesEstrangeiras[0].on_delete, "CASCADE");
  });
});

Deno.test("executarMigracoes e idempotente e preserva dados entre execucoes", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run("Maria", "maria@exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);

    executarMigracoes(conexao);
    executarMigracoes(conexao);

    const total = conexao.prepare("SELECT COUNT(*) AS total FROM usuarios;")
      .get() as {
        total: number;
      };
    assertEquals(total.total, 1);
  });
});

Deno.test("email unico ignora diferenca de maiusculas e minusculas", () => {
  comBancoDeTeste((conexao) => {
    const inserir = conexao.prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
    );
    inserir.run(
      "Joao",
      "joao@exemplo.com",
      "hash",
      "salt",
      DATA_FIXA,
      DATA_FIXA,
    );

    assertThrows(() => {
      inserir.run(
        "Joao Segundo",
        "JOAO@Exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );
    });

    const total = conexao.prepare("SELECT COUNT(*) AS total FROM usuarios;")
      .get() as {
        total: number;
      };
    assertEquals(total.total, 1);
  });
});

Deno.test("papel tem padrao comum, aceita administrador e rejeita outros valores", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Sem Papel",
        "sempapel@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    const usuarioSemPapel = conexao
      .prepare("SELECT papel FROM usuarios WHERE email = ?;")
      .get("sempapel@exemplo.com") as { papel: string };
    assertEquals(usuarioSemPapel.papel, "comum");

    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Admin",
        "admin@exemplo.com",
        "hash",
        "salt",
        "administrador",
        DATA_FIXA,
        DATA_FIXA,
      );

    const admin = conexao
      .prepare("SELECT papel FROM usuarios WHERE email = ?;")
      .get("admin@exemplo.com") as { papel: string };
    assertEquals(admin.papel, "administrador");

    assertThrows(() => {
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
  });
});

Deno.test("nome obrigatorio impede insercao sem nome", () => {
  comBancoDeTeste((conexao) => {
    assertThrows(() => {
      conexao
        .prepare(
          "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
        )
        .run(null, "semnome@exemplo.com", "hash", "salt", DATA_FIXA, DATA_FIXA);
    });
  });
});

Deno.test("excluir usuario apaga suas sessoes em cascata", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Cascata",
        "cascata@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    const usuario = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get("cascata@exemplo.com") as { id: number };

    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run("sessao-1", usuario.id, DATA_FIXA);
    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run("sessao-2", usuario.id, DATA_FIXA);

    conexao.prepare("DELETE FROM usuarios WHERE id = ?;").run(usuario.id);

    const total = conexao.prepare("SELECT COUNT(*) AS total FROM sessoes;")
      .get() as {
        total: number;
      };
    assertEquals(total.total, 0);
  });
});

Deno.test("sessao com usuario_id inexistente falha por chave estrangeira", () => {
  comBancoDeTeste((conexao) => {
    assertThrows(() => {
      conexao
        .prepare(
          "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
        )
        .run("sessao-orfa", 999999, DATA_FIXA);
    });
  });
});

Deno.test("ids de usuarios excluidos nunca sao reutilizados", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Primeiro",
        "primeiro@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    const primeiro = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get("primeiro@exemplo.com") as { id: number };
    assertEquals(primeiro.id, 1);

    conexao.prepare("DELETE FROM usuarios WHERE id = ?;").run(primeiro.id);

    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Segundo",
        "segundo@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    const segundo = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get("segundo@exemplo.com") as { id: number };
    assertEquals(segundo.id, 2);
  });
});

Deno.test("id de sessao deve ser unico", () => {
  comBancoDeTeste((conexao) => {
    conexao
      .prepare(
        "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?);",
      )
      .run(
        "Duplicado",
        "duplicado@exemplo.com",
        "hash",
        "salt",
        DATA_FIXA,
        DATA_FIXA,
      );

    const usuario = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get("duplicado@exemplo.com") as { id: number };

    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run("sessao-repetida", usuario.id, DATA_FIXA);

    assertThrows(() => {
      conexao
        .prepare(
          "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
        )
        .run("sessao-repetida", usuario.id, DATA_FIXA);
    });
  });
});
