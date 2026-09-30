import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { criarSessao } from "../src/modulos/sessoes/repositorio-sessoes.ts";
import {
  atualizarDadosUsuario,
  cadastrarUsuario,
  excluirConta,
  obterUsuario,
} from "../src/modulos/usuarios/servico-usuarios.ts";
import type { UsuarioRegistro } from "../src/modulos/usuarios/tipos-usuarios.ts";
import { verificarSenha } from "../src/utilitarios/senha.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

async function comBanco(
  teste: (conexao: ConexaoBanco) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await teste(conexao);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function contarUsuarios(conexao: ConexaoBanco): number {
  const linha = conexao
    .prepare("SELECT COUNT(*) AS total FROM usuarios;")
    .get() as { total: number };
  return linha.total;
}

Deno.test("cadastro válido cria usuário comum com senha em hash", async () => {
  await comBanco(async (conexao) => {
    const resultado = await cadastrarUsuario(conexao, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    assertEquals(resultado.tipo, "criado");
    assert(resultado.tipo === "criado");
    const usuario = resultado.usuario;
    assertEquals(usuario.nome, "Ana Souza");
    assertEquals(usuario.email, "ana@exemplo.com");
    assertEquals(usuario.papel, "comum");
    assertNotEquals(usuario.senhaHash, "senha123");
    assertEquals(
      await verificarSenha("senha123", usuario.senhaHash, usuario.senhaSalt),
      true,
    );
  });
});

Deno.test("e-mail existente, inclusive com outra capitalização, é duplicado", async () => {
  await comBanco(async (conexao) => {
    await cadastrarUsuario(conexao, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    const igual = await cadastrarUsuario(conexao, {
      nome: "Outra Ana",
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    const outraCapitalizacao = await cadastrarUsuario(conexao, {
      nome: "Outra Ana",
      email: "ANA@Exemplo.com",
      senha: "senha123",
    });
    assertEquals(igual, { tipo: "email_duplicado" });
    assertEquals(outraCapitalizacao, { tipo: "email_duplicado" });
    assertEquals(contarUsuarios(conexao), 1);
  });
});

Deno.test("cadastros simultâneos com o mesmo e-mail geram um único usuário", async () => {
  await comBanco(async (conexao) => {
    const dados = {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha123",
    };
    const resultados = await Promise.all([
      cadastrarUsuario(conexao, dados),
      cadastrarUsuario(conexao, dados),
    ]);
    const tipos = resultados.map((resultado) => resultado.tipo).sort();
    assertEquals(tipos, ["criado", "email_duplicado"]);
    assertEquals(contarUsuarios(conexao), 1);
  });
});

Deno.test("e-mail é gravado exatamente como enviado", async () => {
  await comBanco(async (conexao) => {
    const resultado = await cadastrarUsuario(conexao, {
      nome: "Ana Souza",
      email: "Ana.Souza@Exemplo.COM",
      senha: "senha123",
    });
    assert(resultado.tipo === "criado");
    assertEquals(resultado.usuario.email, "Ana.Souza@Exemplo.COM");
    const linha = conexao
      .prepare("SELECT email FROM usuarios;")
      .get() as { email: string };
    assertEquals(linha.email, "Ana.Souza@Exemplo.COM");
  });
});

async function criarDoisUsuarios(
  conexao: ConexaoBanco,
): Promise<[UsuarioRegistro, UsuarioRegistro]> {
  const a = await cadastrarUsuario(conexao, {
    nome: "Ana Souza",
    email: "ana@exemplo.com",
    senha: "senha123",
  });
  const b = await cadastrarUsuario(conexao, {
    nome: "Bruno Lima",
    email: "bruno@exemplo.com",
    senha: "senha456",
  });
  assert(a.tipo === "criado");
  assert(b.tipo === "criado");
  return [a.usuario, b.usuario];
}

Deno.test("obterUsuario retorna o usuário e null para id inexistente", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    assertEquals(obterUsuario(conexao, a.id)?.email, "ana@exemplo.com");
    assertEquals(obterUsuario(conexao, 999999), null);
  });
});

Deno.test("atualização só do nome mantém e-mail e senha intactos", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    const resultado = await atualizarDadosUsuario(conexao, a.id, {
      nome: "Ana Maria",
    });
    assert(resultado.tipo === "atualizado");
    assertEquals(resultado.usuario.nome, "Ana Maria");
    assertEquals(resultado.usuario.email, a.email);
    assertEquals(resultado.usuario.senhaHash, a.senhaHash);
    assertEquals(resultado.usuario.senhaSalt, a.senhaSalt);
  });
});

Deno.test("atualização da senha troca hash e salt", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    const resultado = await atualizarDadosUsuario(conexao, a.id, {
      senha: "novaSenha1",
    });
    assert(resultado.tipo === "atualizado");
    const u = resultado.usuario;
    assertNotEquals(u.senhaHash, a.senhaHash);
    assertNotEquals(u.senhaSalt, a.senhaSalt);
    assertEquals(
      await verificarSenha("novaSenha1", u.senhaHash, u.senhaSalt),
      true,
    );
    assertEquals(
      await verificarSenha("senha123", u.senhaHash, u.senhaSalt),
      false,
    );
  });
});

Deno.test("atualização com os três campos altera tudo", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    const resultado = await atualizarDadosUsuario(conexao, a.id, {
      nome: "Ana Maria",
      email: "maria@exemplo.com",
      senha: "novaSenha1",
    });
    assert(resultado.tipo === "atualizado");
    assertEquals(resultado.usuario.nome, "Ana Maria");
    assertEquals(resultado.usuario.email, "maria@exemplo.com");
    assertNotEquals(resultado.usuario.senhaHash, a.senhaHash);
  });
});

Deno.test("e-mail de outro usuário retorna email_duplicado sem alterar nada", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    for (const email of ["bruno@exemplo.com", "BRUNO@Exemplo.COM"]) {
      const resultado = await atualizarDadosUsuario(conexao, a.id, {
        nome: "Outro Nome",
        email,
        senha: "novaSenha1",
      });
      assertEquals(resultado, { tipo: "email_duplicado" });
    }
    assertEquals(obterUsuario(conexao, a.id), a);
  });
});

Deno.test("próprio e-mail em outra capitalização é permitido", async () => {
  await comBanco(async (conexao) => {
    const [a] = await criarDoisUsuarios(conexao);
    const resultado = await atualizarDadosUsuario(conexao, a.id, {
      email: "ANA@Exemplo.com",
    });
    assert(resultado.tipo === "atualizado");
    assertEquals(resultado.usuario.email, "ANA@Exemplo.com");
  });
});

Deno.test("atualização de id inexistente retorna nao_encontrado", async () => {
  await comBanco(async (conexao) => {
    const resultado = await atualizarDadosUsuario(conexao, 999999, {
      nome: "Fulano de Tal",
    });
    assertEquals(resultado, { tipo: "nao_encontrado" });
  });
});

Deno.test("atualizações simultâneas para o mesmo e-mail: uma vence, a outra duplica", async () => {
  await comBanco(async (conexao) => {
    const [a, b] = await criarDoisUsuarios(conexao);
    const resultados = await Promise.all([
      atualizarDadosUsuario(conexao, a.id, {
        email: "novo@exemplo.com",
        senha: "novaSenha1",
      }),
      atualizarDadosUsuario(conexao, b.id, {
        email: "novo@exemplo.com",
        senha: "novaSenha2",
      }),
    ]);
    const tipos = resultados.map((r) => r.tipo).sort();
    assertEquals(tipos, ["atualizado", "email_duplicado"]);
  });
});

Deno.test("excluirConta remove usuário e sessões e retorna false na repetição", async () => {
  await comBanco(async (conexao) => {
    const [a, b] = await criarDoisUsuarios(conexao);
    criarSessao(conexao, a.id);
    criarSessao(conexao, a.id);
    criarSessao(conexao, b.id);
    assertEquals(excluirConta(conexao, a.id), true);
    assertEquals(obterUsuario(conexao, a.id), null);
    const restantes = conexao
      .prepare("SELECT usuario_id FROM sessoes;")
      .all() as { usuario_id: number }[];
    assertEquals(restantes.map((l) => l.usuario_id), [b.id]);
    assertEquals(excluirConta(conexao, a.id), false);
  });
});
