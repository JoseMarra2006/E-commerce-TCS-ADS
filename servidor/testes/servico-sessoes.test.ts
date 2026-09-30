import "./auxiliares/vigia-arquivos-reais.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { buscarSessaoPorId } from "../src/modulos/sessoes/repositorio-sessoes.ts";
import {
  autenticarUsuario,
  encerrarSessao,
} from "../src/modulos/sessoes/servico-sessoes.ts";
import { cadastrarUsuario } from "../src/modulos/usuarios/servico-usuarios.ts";
import { verificarTokenJwt } from "../src/utilitarios/jwt.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

async function comBanco(
  teste: (conexao: ConexaoBanco) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await cadastrarUsuario(conexao, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    await teste(conexao);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function contarSessoes(conexao: ConexaoBanco): number {
  const linha = conexao
    .prepare("SELECT COUNT(*) AS total FROM sessoes;")
    .get() as { total: number };
  return linha.total;
}

Deno.test("credenciais corretas criam sessão e token verificável", async () => {
  await comBanco(async (conexao) => {
    const resultado = await autenticarUsuario(conexao, SEGREDO_TESTE, {
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    assert(resultado.tipo === "autenticado");
    const sessao = buscarSessaoPorId(conexao, resultado.sessao.id);
    assert(sessao !== null);
    assertEquals(sessao.usuarioId, resultado.usuario.id);
    const verificacao = await verificarTokenJwt(
      resultado.token,
      SEGREDO_TESTE,
    );
    assert(verificacao.ok);
    assertEquals(verificacao.usuarioId, resultado.usuario.id);
    assertEquals(verificacao.sessaoId, resultado.sessao.id);
  });
});

Deno.test("e-mail em outra capitalização autentica", async () => {
  await comBanco(async (conexao) => {
    const resultado = await autenticarUsuario(conexao, SEGREDO_TESTE, {
      email: "ANA@Exemplo.COM",
      senha: "senha123",
    });
    assertEquals(resultado.tipo, "autenticado");
  });
});

Deno.test("senha errada e e-mail inexistente não criam sessão", async () => {
  await comBanco(async (conexao) => {
    const senhaErrada = await autenticarUsuario(conexao, SEGREDO_TESTE, {
      email: "ana@exemplo.com",
      senha: "outra123",
    });
    assertEquals(senhaErrada, { tipo: "credenciais_invalidas" });
    const inexistente = await autenticarUsuario(conexao, SEGREDO_TESTE, {
      email: "ninguem@exemplo.com",
      senha: "senha123",
    });
    assertEquals(inexistente, { tipo: "credenciais_invalidas" });
    assertEquals(contarSessoes(conexao), 0);
  });
});

Deno.test("dois logins seguidos criam duas sessões diferentes", async () => {
  await comBanco(async (conexao) => {
    const dados = { email: "ana@exemplo.com", senha: "senha123" };
    const primeiro = await autenticarUsuario(conexao, SEGREDO_TESTE, dados);
    const segundo = await autenticarUsuario(conexao, SEGREDO_TESTE, dados);
    assert(primeiro.tipo === "autenticado");
    assert(segundo.tipo === "autenticado");
    assertNotEquals(primeiro.sessao.id, segundo.sessao.id);
    assertNotEquals(primeiro.token, segundo.token);
    assertEquals(contarSessoes(conexao), 2);
    assert(buscarSessaoPorId(conexao, primeiro.sessao.id) !== null);
    assert(buscarSessaoPorId(conexao, segundo.sessao.id) !== null);
  });
});

Deno.test("encerrarSessao remove a sessão e retorna false na repetição", async () => {
  await comBanco(async (conexao) => {
    const resultado = await autenticarUsuario(conexao, SEGREDO_TESTE, {
      email: "ana@exemplo.com",
      senha: "senha123",
    });
    assert(resultado.tipo === "autenticado");
    assertEquals(encerrarSessao(conexao, resultado.sessao.id), true);
    assertEquals(buscarSessaoPorId(conexao, resultado.sessao.id), null);
    assertEquals(encerrarSessao(conexao, resultado.sessao.id), false);
  });
});

Deno.test("falha na geração do token relança o erro e não deixa sessão", async () => {
  await comBanco(async (conexao) => {
    await assertRejects(() =>
      autenticarUsuario(conexao, "", {
        email: "ana@exemplo.com",
        senha: "senha123",
      })
    );
    assertEquals(contarSessoes(conexao), 0);
  });
});
