import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  abrirConexao,
  type ConexaoBanco,
  fecharConexao,
} from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  abrirConexaoSomenteLeitura,
  consultarUsuariosLogados,
} from "../src/logados/consulta-usuarios-logados.ts";
import { MonitorUsuariosLogados } from "../src/logados/monitor-usuarios-logados.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

interface Contexto {
  caminho: string;
  escritor: ConexaoBanco;
  leitor: ConexaoBanco;
}

async function comBanco(
  teste: (contexto: Contexto) => void | Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const escritor = abrirConexao(caminho);
  let leitor: ConexaoBanco | null = null;
  try {
    executarMigracoes(escritor);
    leitor = abrirConexaoSomenteLeitura(caminho);
    await teste({ caminho, escritor, leitor });
  } finally {
    if (leitor !== null) {
      fecharConexao(leitor);
    }
    fecharConexao(escritor);
    removerBancoTemporario(caminho);
  }
}

function criarUsuario(
  conexao: ConexaoBanco,
  nome: string,
  email: string,
  papel = "comum",
): number {
  const agora = new Date().toISOString();
  const linha = conexao
    .prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, 'hash-secreto', 'salt-secreto', ?, ?, ?) RETURNING id;",
    )
    .get(nome, email, papel, agora, agora);
  return Number(linha?.id);
}

function criarSessao(
  conexao: ConexaoBanco,
  usuarioId: number,
  criadoEm: string,
): string {
  const id = crypto.randomUUID();
  conexao
    .prepare(
      "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
    )
    .run(id, usuarioId, criadoEm);
  return id;
}

function contar(conexao: ConexaoBanco, tabela: "usuarios" | "sessoes"): number {
  const linha = conexao.prepare(`SELECT COUNT(*) AS total FROM ${tabela};`)
    .get();
  return Number(linha?.total);
}

Deno.test("agrupa por usuário, conta sessões, usa a mais antiga e ordena por id", async () => {
  await comBanco(({ escritor, leitor }) => {
    const adm = criarUsuario(
      escritor,
      "Admin",
      "adm@teste.com",
      "administrador",
    );
    const semSessao = criarUsuario(escritor, "Sem Sessão", "sem@teste.com");
    const ana = criarUsuario(escritor, "Ána Çãõ 🚀", "ána@exemplo.com");
    const bruno = criarUsuario(escritor, "Bruno", "bruno@exemplo.com");
    criarSessao(escritor, bruno, "2026-01-03T00:00:00.000Z");
    criarSessao(escritor, ana, "2026-01-02T10:00:00.000Z");
    criarSessao(escritor, ana, "2026-01-01T09:00:00.000Z");
    criarSessao(escritor, adm, "2026-01-05T00:00:00.000Z");

    const lista = consultarUsuariosLogados(leitor);
    assertEquals(lista, [
      {
        id: adm,
        nome: "Admin",
        email: "adm@teste.com",
        tipo: "administrador",
        sessoes: 1,
        desde: "2026-01-05T00:00:00.000Z",
      },
      {
        id: ana,
        nome: "Ána Çãõ 🚀",
        email: "ána@exemplo.com",
        tipo: "comum",
        sessoes: 2,
        desde: "2026-01-01T09:00:00.000Z",
      },
      {
        id: bruno,
        nome: "Bruno",
        email: "bruno@exemplo.com",
        tipo: "comum",
        sessoes: 1,
        desde: "2026-01-03T00:00:00.000Z",
      },
    ]);
    assert(lista.every((item) => item.id !== semSessao));
    for (const item of lista) {
      assertEquals(Object.keys(item), [
        "id",
        "nome",
        "email",
        "tipo",
        "sessoes",
        "desde",
      ]);
    }
    const texto = JSON.stringify(lista);
    for (
      const proibido of [
        "hash-secreto",
        "salt-secreto",
        "token",
        "senha",
        "papel",
        "usuario_id",
      ]
    ) {
      assertEquals(texto.includes(proibido), false, proibido);
    }
  });
});

Deno.test("lista vazia sem sessões e exclusão de usuário remove o item (cascata)", async () => {
  await comBanco(({ escritor, leitor }) => {
    criarUsuario(escritor, "Admin", "adm@teste.com", "administrador");
    assertEquals(consultarUsuariosLogados(leitor), []);
    const ana = criarUsuario(escritor, "Ana Souza", "ana@exemplo.com");
    const sessoes = [
      criarSessao(escritor, ana, "2026-01-01T00:00:00.000Z"),
      criarSessao(escritor, ana, "2026-01-02T00:00:00.000Z"),
    ];
    const texto = JSON.stringify(consultarUsuariosLogados(leitor));
    for (const id of sessoes) {
      assertEquals(texto.includes(id), false);
    }
    assertEquals(consultarUsuariosLogados(leitor).length, 1);
    escritor.prepare("DELETE FROM usuarios WHERE id = ?;").run(ana);
    assertEquals(consultarUsuariosLogados(leitor), []);
  });
});

Deno.test("a conexão do monitor é somente leitura e não altera o banco", async () => {
  await comBanco(({ escritor, leitor }) => {
    const ana = criarUsuario(escritor, "Ana Souza", "ana@exemplo.com");
    criarSessao(escritor, ana, "2026-01-01T00:00:00.000Z");
    assertEquals(
      { ...leitor.prepare("PRAGMA query_only;").get() },
      { query_only: 1 },
    );
    assertEquals(
      { ...leitor.prepare("PRAGMA busy_timeout;").get() },
      { timeout: 5000 },
    );
    const comandos = [
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES ('X', 'x@x.com', 'h', 's', 'a', 'a');",
      "UPDATE usuarios SET nome = 'Hacker';",
      "DELETE FROM sessoes;",
      "DELETE FROM usuarios;",
      "CREATE TABLE invasora (a INTEGER);",
      "DROP TABLE sessoes;",
      "PRAGMA journal_mode = DELETE;",
      "PRAGMA query_only = OFF; DELETE FROM sessoes;",
    ];
    for (const comando of comandos) {
      assertThrows(() => leitor.exec(comando), Error, undefined, comando);
    }
    assertEquals(contar(escritor, "usuarios"), 1);
    assertEquals(contar(escritor, "sessoes"), 1);
    assertEquals(
      { ...escritor.prepare("SELECT nome FROM usuarios;").get() },
      { nome: "Ana Souza" },
    );
    assertEquals(
      { ...escritor.prepare("PRAGMA journal_mode;").get() },
      { journal_mode: "wal" },
    );
    assertEquals(
      escritor
        .prepare("SELECT name FROM sqlite_master WHERE name = 'invasora';")
        .all(),
      [],
    );
  });
});

Deno.test("abrir somente leitura não cria banco inexistente", () => {
  const caminho = criarCaminhoBancoTemporario();
  assertThrows(() => abrirConexaoSomenteLeitura(caminho));
  assertThrows(() => Deno.statSync(caminho), Deno.errors.NotFound);
});

Deno.test("WAL: gravações de outra conexão sem checkpoint são vistas imediatamente", async () => {
  await comBanco(({ caminho, escritor, leitor }) => {
    escritor.exec("PRAGMA wal_autocheckpoint = 0;");
    assertEquals(consultarUsuariosLogados(leitor), []);
    const ana = criarUsuario(escritor, "Ana Souza", "ana@exemplo.com");
    criarSessao(escritor, ana, "2026-01-01T00:00:00.000Z");
    assert(Deno.statSync(`${caminho}-wal`).size > 0);
    assertEquals(consultarUsuariosLogados(leitor).map((u) => u.id), [ana]);
    criarSessao(escritor, ana, "2026-01-02T00:00:00.000Z");
    assertEquals(consultarUsuariosLogados(leitor)[0].sessoes, 2);
    escritor.prepare("UPDATE usuarios SET nome = ? WHERE id = ?;").run(
      "Ana Nova",
      ana,
    );
    assertEquals(consultarUsuariosLogados(leitor)[0].nome, "Ana Nova");
  });
});

function gravarEmParalelo(
  caminhoBanco: string,
  prefixo: string,
  quantidade: number,
): Promise<{ ok: boolean; mensagem?: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./auxiliares/trabalhador-sessoes-teste.ts", import.meta.url)
        .href,
      { type: "module" },
    );
    worker.onmessage = (evento: MessageEvent<unknown>) => {
      worker.terminate();
      resolve(evento.data as { ok: boolean; mensagem?: string });
    };
    worker.onerror = (evento: ErrorEvent) => {
      evento.preventDefault();
      worker.terminate();
      reject(new Error(evento.message));
    };
    worker.postMessage({ caminhoBanco, prefixo, quantidade });
  });
}

Deno.test("200 gravações concorrentes durante leituras repetidas: sem bloqueio nem indisponibilidade", async () => {
  await comBanco(async ({ caminho, leitor }) => {
    const registros: string[] = [];
    const monitor = new MonitorUsuariosLogados({
      caminhoBanco: caminho,
      atrasoDebounceMs: 1,
      esperaMaximaMs: 5,
      intervaloReleituraMs: 60000,
      registrar: (nivel, mensagem) => registros.push(`${nivel}: ${mensagem}`),
    });
    monitor.iniciar();
    try {
      let terminou = false;
      let leituras = 0;
      let maximo = 0;
      const gravacoes = Promise.all(
        ["a", "b", "c", "d"].map((prefixo) =>
          gravarEmParalelo(caminho, prefixo, 50)
        ),
      ).finally(() => {
        terminou = true;
      });
      while (!terminou) {
        const lista = consultarUsuariosLogados(leitor);
        assert(lista.length >= maximo);
        maximo = lista.length;
        leituras++;
        monitor.solicitarAtualizacao();
        assertEquals(monitor.obterInstantaneo().estado, "disponivel");
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (const resultado of await gravacoes) {
        assertEquals(resultado.ok, true, resultado.mensagem);
      }
      assert(leituras > 1, `leituras: ${leituras}`);
      assertEquals(consultarUsuariosLogados(leitor).length, 200);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const final = monitor.obterInstantaneo();
      assertEquals(final.estado, "disponivel");
      assertEquals(final.usuarios.length, 200);
      assertEquals(registros.filter((r) => r.startsWith("erro")), []);
    } finally {
      monitor.parar();
    }
  });
});
