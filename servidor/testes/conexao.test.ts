import { assert, assertEquals, assertThrows } from "@std/assert";
import { basename, dirname } from "node:path";
import {
  abrirConexao,
  fecharConexao,
  garantirPastaDoBanco,
  obterCaminhoBanco,
} from "../src/banco/conexao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

Deno.test("obterCaminhoBanco retorna caminho absoluto para dados/ecommerce.db", () => {
  const caminho = obterCaminhoBanco();
  assert(caminho.length > 0);
  assertEquals(basename(caminho), "ecommerce.db");
  assertEquals(basename(dirname(caminho)), "dados");
});

Deno.test("abrirConexao cria arquivo e aplica configuracoes", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexao = abrirConexao(caminho);
    try {
      const modoJournal = conexao.prepare("PRAGMA journal_mode;").get() as {
        journal_mode: string;
      };
      const chavesEstrangeiras = conexao.prepare("PRAGMA foreign_keys;")
        .get() as {
          foreign_keys: number;
        };
      const tempoLimite = conexao.prepare("PRAGMA busy_timeout;").get() as {
        timeout: number;
      };
      assertEquals(modoJournal.journal_mode, "wal");
      assertEquals(chavesEstrangeiras.foreign_keys, 1);
      assertEquals(tempoLimite.timeout, 5000);
    } finally {
      fecharConexao(conexao);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("duas conexoes simultaneas no mesmo arquivo conseguem ler e escrever", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexaoEscrita = abrirConexao(caminho);
    const conexaoLeitura = abrirConexao(caminho);
    try {
      conexaoEscrita.exec(
        "CREATE TABLE teste_conexao (id INTEGER PRIMARY KEY, valor TEXT NOT NULL);",
      );
      conexaoEscrita.prepare("INSERT INTO teste_conexao (valor) VALUES (?);")
        .run(
          "ola",
        );
      const registro = conexaoLeitura.prepare(
        "SELECT valor FROM teste_conexao WHERE id = 1;",
      ).get() as { valor: string };
      assertEquals(registro.valor, "ola");
    } finally {
      fecharConexao(conexaoEscrita);
      fecharConexao(conexaoLeitura);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("fecharConexao chamado duas vezes nao lanca erro", () => {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexao = abrirConexao(caminho);
    fecharConexao(conexao);
    fecharConexao(conexao);
  } finally {
    removerBancoTemporario(caminho);
  }
});

Deno.test("apos fechar a conexao os arquivos do banco podem ser removidos", () => {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  fecharConexao(conexao);
  removerBancoTemporario(caminho);
  let existeArquivo = true;
  try {
    Deno.statSync(caminho);
  } catch (erro) {
    if (erro instanceof Deno.errors.NotFound) {
      existeArquivo = false;
    } else {
      throw erro;
    }
  }
  assertEquals(existeArquivo, false);
});

Deno.test("garantirPastaDoBanco cria subpasta inexistente", () => {
  const caminhoBase = criarCaminhoBancoTemporario();
  const pastaTeste = `${caminhoBase}-pasta`;
  const caminhoBanco = `${pastaTeste}/banco.db`;
  try {
    garantirPastaDoBanco(caminhoBanco);
    const informacoes = Deno.statSync(pastaTeste);
    assert(informacoes.isDirectory);
  } finally {
    let pastaExiste = true;
    try {
      Deno.statSync(pastaTeste);
    } catch {
      pastaExiste = false;
    }
    if (pastaExiste) {
      Deno.removeSync(pastaTeste, { recursive: true });
    }
  }
});

Deno.test("abrirConexao com caminho invalido lanca erro com mensagem esperada", () => {
  const caminhoBase = criarCaminhoBancoTemporario();
  const caminhoInvalido = `${caminhoBase}-inexistente/banco.db`;
  assertThrows(
    () => abrirConexao(caminhoInvalido),
    Error,
    "Não foi possível abrir o banco de dados:",
  );
});
