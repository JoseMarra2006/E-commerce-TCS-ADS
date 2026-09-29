import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { ehErroEmailDuplicado } from "../src/banco/erros.ts";
import {
  atualizarUsuario,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  criarUsuario,
  emailPertenceAOutroUsuario,
  excluirUsuario,
} from "../src/modulos/usuarios/repositorio-usuarios.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

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

Deno.test("criarUsuario retorna o registro completo com papel comum", () => {
  comBancoDeTeste((conexao) => {
    const usuario = criarUsuario(conexao, {
      nome: "Joao",
      email: "joao@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    assert(Number.isInteger(usuario.id));
    assertEquals(usuario.nome, "Joao");
    assertEquals(usuario.email, "joao@exemplo.com");
    assertEquals(usuario.senhaHash, "hash-teste");
    assertEquals(usuario.senhaSalt, "salt-teste");
    assertEquals(usuario.papel, "comum");
    assertEquals(usuario.criadoEm, usuario.atualizadoEm);
    assert(!Number.isNaN(new Date(usuario.criadoEm).getTime()));
  });
});

Deno.test("criar dois usuarios gera ids diferentes e crescentes", () => {
  comBancoDeTeste((conexao) => {
    const primeiro = criarUsuario(conexao, {
      nome: "Primeiro",
      email: "primeiro@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });
    const segundo = criarUsuario(conexao, {
      nome: "Segundo",
      email: "segundo@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    assert(segundo.id > primeiro.id);
  });
});

Deno.test("criar usuario com email existente em outra capitalizacao falha", () => {
  comBancoDeTeste((conexao) => {
    criarUsuario(conexao, {
      nome: "Joao",
      email: "joao@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    let erroCapturado: unknown;
    try {
      criarUsuario(conexao, {
        nome: "Joao2",
        email: "JOAO@Exemplo.COM",
        senhaHash: "hash-teste",
        senhaSalt: "salt-teste",
      });
    } catch (erro) {
      erroCapturado = erro;
    }

    assert(erroCapturado !== undefined);
    assertEquals(ehErroEmailDuplicado(erroCapturado), true);
  });
});

Deno.test("buscarUsuarioPorId encontra o usuario e retorna null quando nao existe", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Maria",
      email: "maria@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const encontrado = buscarUsuarioPorId(conexao, criado.id);
    assertEquals(encontrado, criado);

    const inexistente = buscarUsuarioPorId(conexao, criado.id + 1000);
    assertEquals(inexistente, null);
  });
});

Deno.test("buscarUsuarioPorEmail ignora capitalizacao e retorna null quando nao existe", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Joao",
      email: "joao@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const encontrado = buscarUsuarioPorEmail(conexao, "JOAO@Exemplo.COM");
    assertEquals(encontrado, criado);

    const inexistente = buscarUsuarioPorEmail(conexao, "ninguem@exemplo.com");
    assertEquals(inexistente, null);
  });
});

Deno.test("emailPertenceAOutroUsuario distingue o proprio email do de outros usuarios", () => {
  comBancoDeTeste((conexao) => {
    const usuarioA = criarUsuario(conexao, {
      nome: "A",
      email: "a@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });
    const usuarioB = criarUsuario(conexao, {
      nome: "B",
      email: "b@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    assertEquals(
      emailPertenceAOutroUsuario(conexao, "A@Exemplo.com", usuarioA.id),
      false,
    );
    assertEquals(
      emailPertenceAOutroUsuario(conexao, "b@exemplo.com", usuarioA.id),
      true,
    );
    assertEquals(
      emailPertenceAOutroUsuario(conexao, "ninguem@exemplo.com", usuarioA.id),
      false,
    );

    assert(usuarioB.id !== usuarioA.id);
  });
});

Deno.test("atualizarUsuario altera somente o nome informado", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Antigo",
      email: "nome@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    const atualizado = atualizarUsuario(conexao, criado.id, { nome: "Novo" });

    assert(atualizado !== null);
    assertEquals(atualizado.nome, "Novo");
    assertEquals(atualizado.email, criado.email);
    assertEquals(atualizado.senhaHash, criado.senhaHash);
    assertEquals(atualizado.senhaSalt, criado.senhaSalt);
    assert(
      new Date(atualizado.atualizadoEm).getTime() >=
        new Date(criado.criadoEm).getTime(),
    );
  });
});

Deno.test("atualizarUsuario altera senhaHash e senhaSalt juntos", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Senha",
      email: "senha@exemplo.com",
      senhaHash: "hash-antigo",
      senhaSalt: "salt-antigo",
    });

    const atualizado = atualizarUsuario(conexao, criado.id, {
      senha: { hash: "hash-novo", salt: "salt-novo" },
    });

    assert(atualizado !== null);
    assertEquals(atualizado.senhaHash, "hash-novo");
    assertEquals(atualizado.senhaSalt, "salt-novo");
    assertEquals(atualizado.nome, criado.nome);
    assertEquals(atualizado.email, criado.email);
  });
});

Deno.test("atualizarUsuario com todos os campos altera tudo", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Tudo",
      email: "tudo@exemplo.com",
      senhaHash: "hash-antigo",
      senhaSalt: "salt-antigo",
    });

    const atualizado = atualizarUsuario(conexao, criado.id, {
      nome: "Tudo Novo",
      email: "tudo-novo@exemplo.com",
      senha: { hash: "hash-novo", salt: "salt-novo" },
    });

    assert(atualizado !== null);
    assertEquals(atualizado.nome, "Tudo Novo");
    assertEquals(atualizado.email, "tudo-novo@exemplo.com");
    assertEquals(atualizado.senhaHash, "hash-novo");
    assertEquals(atualizado.senhaSalt, "salt-novo");
  });
});

Deno.test("atualizarUsuario para email de outro usuario falha e nao altera nada", () => {
  comBancoDeTeste((conexao) => {
    criarUsuario(conexao, {
      nome: "Ocupado",
      email: "ocupado@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });
    const alvo = criarUsuario(conexao, {
      nome: "Alvo",
      email: "alvo@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    let erroCapturado: unknown;
    try {
      atualizarUsuario(conexao, alvo.id, { email: "ocupado@exemplo.com" });
    } catch (erro) {
      erroCapturado = erro;
    }

    assert(erroCapturado !== undefined);
    assertEquals(ehErroEmailDuplicado(erroCapturado), true);

    const inalterado = buscarUsuarioPorId(conexao, alvo.id);
    assertEquals(inalterado, alvo);
  });
});

Deno.test("atualizarUsuario sem campos lanca erro", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Vazio",
      email: "vazio@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    assertThrows(
      () => {
        atualizarUsuario(conexao, criado.id, {});
      },
      Error,
      "Nenhum campo informado para atualização.",
    );
  });
});

Deno.test("atualizarUsuario em id inexistente retorna null", () => {
  comBancoDeTeste((conexao) => {
    const resultado = atualizarUsuario(conexao, 999999, { nome: "Ninguem" });
    assertEquals(resultado, null);
  });
});

Deno.test("excluirUsuario remove o usuario e suas sessoes, e excluir de novo retorna false", () => {
  comBancoDeTeste((conexao) => {
    const criado = criarUsuario(conexao, {
      nome: "Excluir",
      email: "excluir@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    conexao
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run("sessao-teste", criado.id, new Date().toISOString());

    const excluiu = excluirUsuario(conexao, criado.id);
    assertEquals(excluiu, true);
    assertEquals(buscarUsuarioPorId(conexao, criado.id), null);

    const sessoesRestantes = conexao
      .prepare("SELECT COUNT(*) AS total FROM sessoes WHERE usuario_id = ?;")
      .get(criado.id) as { total: number };
    assertEquals(sessoesRestantes.total, 0);

    const excluiuDeNovo = excluirUsuario(conexao, criado.id);
    assertEquals(excluiuDeNovo, false);
  });
});

Deno.test("nome com caracteres de injecao de sql e gravado literalmente", () => {
  comBancoDeTeste((conexao) => {
    const nomeMalicioso = "Robert'); DROP TABLE usuarios;--";
    const criado = criarUsuario(conexao, {
      nome: nomeMalicioso,
      email: "robert@exemplo.com",
      senhaHash: "hash-teste",
      senhaSalt: "salt-teste",
    });

    assertEquals(criado.nome, nomeMalicioso);

    const encontrado = buscarUsuarioPorId(conexao, criado.id);
    assert(encontrado !== null);
    assertEquals(encontrado.nome, nomeMalicioso);

    const tabela = conexao
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usuarios';",
      )
      .get();
    assert(tabela !== undefined);
  });
});
