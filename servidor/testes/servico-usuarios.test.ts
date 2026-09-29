import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { cadastrarUsuario } from "../src/modulos/usuarios/servico-usuarios.ts";
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
