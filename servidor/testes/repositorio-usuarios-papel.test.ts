import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  buscarUsuarioPorId,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
} from "../src/modulos/usuarios/repositorio-usuarios.ts";
import type { PapelUsuario } from "../src/modulos/usuarios/tipos-usuarios.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

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
  email: string,
  papel?: PapelUsuario,
) {
  return criarUsuario(conexao, {
    nome: `Usuario ${email}`,
    email,
    senhaHash: "hash-teste",
    senhaSalt: "salt-teste",
    papel,
  });
}

Deno.test("criarUsuario sem papel grava papel comum", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criar(conexao, "comum@exemplo.com");
    assertEquals(usuario.papel, "comum");
    const linha = conexao
      .prepare("SELECT papel FROM usuarios WHERE id = ?;")
      .get(usuario.id) as { papel: string };
    assertEquals(linha.papel, "comum");
  });
});

Deno.test("criarUsuario com papel administrador grava administrador", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criar(conexao, "adm@exemplo.com", "administrador");
    assertEquals(usuario.papel, "administrador");
    const linha = conexao
      .prepare("SELECT papel FROM usuarios WHERE id = ?;")
      .get(usuario.id) as { papel: string };
    assertEquals(linha.papel, "administrador");
    assertEquals(
      buscarUsuarioPorId(conexao, usuario.id)?.papel,
      "administrador",
    );
  });
});

Deno.test("criarUsuario com papel comum explícito grava comum", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criar(conexao, "explicito@exemplo.com", "comum");
    assertEquals(usuario.papel, "comum");
  });
});

Deno.test("listarUsuarios em banco vazio devolve lista vazia", () => {
  comBancoDeTeste((conexao) => {
    assertEquals(listarUsuarios(conexao), []);
  });
});

Deno.test("listarUsuarios devolve todos por id crescente com o papel de cada um", () => {
  comBancoDeTeste((conexao) => {
    const a = criar(conexao, "a@exemplo.com");
    const b = criar(conexao, "b@exemplo.com", "administrador");
    const c = criar(conexao, "c@exemplo.com");
    const d = criar(conexao, "d@exemplo.com", "administrador");
    excluirUsuario(conexao, c.id);

    const lista = listarUsuarios(conexao);
    assertEquals(
      lista.map((usuario) => [usuario.id, usuario.email, usuario.papel]),
      [
        [a.id, "a@exemplo.com", "comum"],
        [b.id, "b@exemplo.com", "administrador"],
        [d.id, "d@exemplo.com", "administrador"],
      ],
    );
    assertEquals(lista[0], buscarUsuarioPorId(conexao, a.id));
  });
});

Deno.test("listarUsuarios ordena por id mesmo quando a inserção foi fora de ordem", () => {
  comBancoDeTeste((conexao) => {
    const inserir = conexao.prepare(
      "INSERT INTO usuarios (id, nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, ?, 'h', 's', ?, 'agora', 'agora');",
    );
    inserir.run(30, "Trinta", "trinta@exemplo.com", "comum");
    inserir.run(7, "Sete", "sete@exemplo.com", "administrador");
    inserir.run(19, "Dezenove", "dezenove@exemplo.com", "comum");

    assertEquals(
      listarUsuarios(conexao).map((usuario) => [usuario.id, usuario.papel]),
      [[7, "administrador"], [19, "comum"], [30, "comum"]],
    );
  });
});
