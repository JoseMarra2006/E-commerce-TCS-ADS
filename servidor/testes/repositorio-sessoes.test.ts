import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { classificarErroBanco } from "../src/banco/erros.ts";
import { criarUsuario } from "../src/modulos/usuarios/repositorio-usuarios.ts";
import {
  buscarSessaoPorId,
  criarSessao,
  excluirSessao,
} from "../src/modulos/sessoes/repositorio-sessoes.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

Deno.test("criarSessao retorna id em formato UUID, usuarioId correto e criadoEm ISO 8601", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criarUsuario(conexao, {
      nome: "Sessao",
      email: "sessao@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const sessao = criarSessao(conexao, usuario.id);

    assert(PADRAO_UUID.test(sessao.id));
    assertEquals(sessao.usuarioId, usuario.id);
    assert(!Number.isNaN(new Date(sessao.criadoEm).getTime()));
  });
});

Deno.test("duas sessoes do mesmo usuario tem ids diferentes", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criarUsuario(conexao, {
      nome: "Multi",
      email: "multi@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const primeira = criarSessao(conexao, usuario.id);
    const segunda = criarSessao(conexao, usuario.id);

    assert(primeira.id !== segunda.id);
  });
});

Deno.test("criarSessao com usuario inexistente falha por chave estrangeira", () => {
  comBancoDeTeste((conexao) => {
    let erroCapturado: unknown;
    try {
      criarSessao(conexao, 999999);
    } catch (erro) {
      erroCapturado = erro;
    }

    assert(erroCapturado !== undefined);
    assertEquals(classificarErroBanco(erroCapturado).tipo, "chave_estrangeira");
  });
});

Deno.test("buscarSessaoPorId encontra a sessao e retorna null quando nao existe", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criarUsuario(conexao, {
      nome: "Busca",
      email: "busca@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const sessao = criarSessao(conexao, usuario.id);

    const encontrada = buscarSessaoPorId(conexao, sessao.id);
    assertEquals(encontrada, sessao);

    const inexistente = buscarSessaoPorId(
      conexao,
      "00000000-0000-0000-0000-000000000000",
    );
    assertEquals(inexistente, null);
  });
});

Deno.test("excluirSessao remove somente a sessao indicada e excluir de novo retorna false", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criarUsuario(conexao, {
      nome: "Exclusao",
      email: "exclusao@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const sessaoA = criarSessao(conexao, usuario.id);
    const sessaoB = criarSessao(conexao, usuario.id);

    const excluiu = excluirSessao(conexao, sessaoA.id);
    assertEquals(excluiu, true);

    assertEquals(buscarSessaoPorId(conexao, sessaoA.id), null);
    assertEquals(buscarSessaoPorId(conexao, sessaoB.id), sessaoB);

    const excluiuDeNovo = excluirSessao(conexao, sessaoA.id);
    assertEquals(excluiuDeNovo, false);
  });
});
