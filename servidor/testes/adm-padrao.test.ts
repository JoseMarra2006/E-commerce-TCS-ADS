import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  EMAIL_ADM_PADRAO,
  garantirAdmPadrao,
  MENSAGEM_ADM_PADRAO_CRIADO,
  MENSAGEM_ADM_PADRAO_EXISTENTE,
  NOME_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  criarUsuario,
  listarUsuarios,
} from "../src/modulos/usuarios/repositorio-usuarios.ts";
import type { UsuarioRegistro } from "../src/modulos/usuarios/tipos-usuarios.ts";
import { gerarHashSenha, verificarSenha } from "../src/utilitarios/senha.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

interface EntradaLog {
  nivel: "info" | "erro";
  mensagem: string;
}

async function comBancoDeTeste(
  fn: (conexao: ConexaoBanco) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  try {
    const conexao = abrirConexao(caminho);
    try {
      executarMigracoes(conexao);
      await fn(conexao);
    } finally {
      fecharConexao(conexao);
    }
  } finally {
    removerBancoTemporario(caminho);
  }
}

function criarRegistrador(): {
  entradas: EntradaLog[];
  registrar: (nivel: "info" | "erro", mensagem: string) => void;
} {
  const entradas: EntradaLog[] = [];
  return {
    entradas,
    registrar: (nivel, mensagem) => {
      entradas.push({ nivel, mensagem });
    },
  };
}

function verificarLogSemSegredos(
  entradas: EntradaLog[],
  usuarios: UsuarioRegistro[],
): void {
  const texto = JSON.stringify(entradas);
  assert(!texto.includes(SENHA_ADM_PADRAO), "o log contém a senha do ADM");
  for (const usuario of usuarios) {
    assert(!texto.includes(usuario.senhaHash), "o log contém um hash");
    assert(!texto.includes(usuario.senhaSalt), "o log contém um salt");
  }
}

async function criarComum(
  conexao: ConexaoBanco,
  email: string,
  senha: string,
): Promise<UsuarioRegistro> {
  const { hash, salt } = await gerarHashSenha(senha);
  return criarUsuario(conexao, {
    nome: "Pessoa Comum",
    email,
    senhaHash: hash,
    senhaSalt: salt,
  });
}

Deno.test("banco vazio: cria o ADM padrão com id 1, dados e papel corretos", async () => {
  await comBancoDeTeste(async (conexao) => {
    const { entradas, registrar } = criarRegistrador();

    const resultado = await garantirAdmPadrao(conexao, registrar);

    assertEquals(resultado, "criado");
    const usuarios = listarUsuarios(conexao);
    assertEquals(usuarios.length, 1);
    const adm = usuarios[0];
    assertEquals(adm.id, 1);
    assertEquals(adm.nome, NOME_ADM_PADRAO);
    assertEquals(adm.nome, "Admin");
    assertEquals(adm.email, EMAIL_ADM_PADRAO);
    assertEquals(adm.email, "adm@teste.com");
    assertEquals(adm.papel, "administrador");
    assert(adm.senhaHash !== SENHA_ADM_PADRAO);
    assert(!adm.senhaHash.includes(SENHA_ADM_PADRAO));
    assert(await verificarSenha("admin123", adm.senhaHash, adm.senhaSalt));
    assert(!(await verificarSenha("admin124", adm.senhaHash, adm.senhaSalt)));
    assertEquals(entradas, [
      { nivel: "info", mensagem: MENSAGEM_ADM_PADRAO_CRIADO },
    ]);
    assertEquals(entradas[0].mensagem, "ADM padrão criado (adm@teste.com).");
    verificarLogSemSegredos(entradas, usuarios);
  });
});

Deno.test("segunda chamada não cria outro ADM e não altera o existente", async () => {
  await comBancoDeTeste(async (conexao) => {
    const { entradas, registrar } = criarRegistrador();
    await garantirAdmPadrao(conexao, registrar);
    const antes = listarUsuarios(conexao);

    const resultado = await garantirAdmPadrao(conexao, registrar);

    assertEquals(resultado, "existente");
    assertEquals(listarUsuarios(conexao), antes);
    assertEquals(entradas.length, 2);
    assertEquals(entradas[1], {
      nivel: "info",
      mensagem: MENSAGEM_ADM_PADRAO_EXISTENTE,
    });
    verificarLogSemSegredos(entradas, antes);
  });
});

Deno.test("e-mail pré-existente como comum, em outra caixa, não é alterado e gera aviso", async () => {
  await comBancoDeTeste(async (conexao) => {
    const existente = await criarComum(conexao, "ADM@TESTE.COM", "outra123");
    const { entradas, registrar } = criarRegistrador();

    const resultado = await garantirAdmPadrao(conexao, registrar);

    assertEquals(resultado, "existente");
    const usuarios = listarUsuarios(conexao);
    assertEquals(usuarios, [existente]);
    assertEquals(usuarios[0].papel, "comum");
    assertEquals(usuarios[0].email, "ADM@TESTE.COM");
    assert(
      await verificarSenha(
        "outra123",
        usuarios[0].senhaHash,
        usuarios[0].senhaSalt,
      ),
    );
    assert(
      !(await verificarSenha(
        "admin123",
        usuarios[0].senhaHash,
        usuarios[0].senhaSalt,
      )),
    );
    assertEquals(entradas, [
      { nivel: "info", mensagem: MENSAGEM_ADM_PADRAO_EXISTENTE },
    ]);
    assert(entradas[0].mensagem.startsWith("Aviso:"));
    verificarLogSemSegredos(entradas, usuarios);
  });
});

Deno.test("e-mail pré-existente como comum, na mesma caixa, não é alterado", async () => {
  await comBancoDeTeste(async (conexao) => {
    const existente = await criarComum(conexao, "adm@teste.com", "outra123");
    const { registrar } = criarRegistrador();

    assertEquals(await garantirAdmPadrao(conexao, registrar), "existente");
    assertEquals(listarUsuarios(conexao), [existente]);
  });
});

Deno.test("e-mail pré-existente já administrador não é alterado", async () => {
  await comBancoDeTeste(async (conexao) => {
    const { hash, salt } = await gerarHashSenha("trocada99");
    const existente = criarUsuario(conexao, {
      nome: "Outro Nome",
      email: "Adm@Teste.com",
      senhaHash: hash,
      senhaSalt: salt,
      papel: "administrador",
    });
    const { entradas, registrar } = criarRegistrador();

    assertEquals(await garantirAdmPadrao(conexao, registrar), "existente");

    const usuarios = listarUsuarios(conexao);
    assertEquals(usuarios, [existente]);
    assertEquals(usuarios[0].nome, "Outro Nome");
    assert(
      await verificarSenha(
        "trocada99",
        usuarios[0].senhaHash,
        usuarios[0].senhaSalt,
      ),
    );
    assertEquals(entradas, [
      { nivel: "info", mensagem: MENSAGEM_ADM_PADRAO_EXISTENTE },
    ]);
  });
});

Deno.test("corrida: e-mail duplicado no INSERT não lança erro e não duplica", async () => {
  await comBancoDeTeste(async (conexao) => {
    conexao.exec(
      "CREATE TRIGGER teste_corrida BEFORE INSERT ON usuarios WHEN NEW.email = 'adm@teste.com' " +
        "BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: usuarios.email'); END;",
    );
    const { entradas, registrar } = criarRegistrador();

    const resultado = await garantirAdmPadrao(conexao, registrar);

    assertEquals(resultado, "existente");
    assertEquals(listarUsuarios(conexao), []);
    assertEquals(entradas, [
      { nivel: "info", mensagem: MENSAGEM_ADM_PADRAO_EXISTENTE },
    ]);
    conexao.exec("BEGIN IMMEDIATE; ROLLBACK;");
  });
});

Deno.test("outra falha do banco ao inserir propaga e não deixa transação aberta", async () => {
  await comBancoDeTeste(async (conexao) => {
    conexao.exec(
      "CREATE TRIGGER teste_falha BEFORE INSERT ON usuarios " +
        "BEGIN SELECT RAISE(ABORT, 'falha simulada do banco'); END;",
    );
    const { entradas, registrar } = criarRegistrador();

    await assertRejects(
      () => garantirAdmPadrao(conexao, registrar),
      Error,
      "falha simulada do banco",
    );

    assertEquals(listarUsuarios(conexao), []);
    assertEquals(entradas, []);
    conexao.exec("BEGIN IMMEDIATE; ROLLBACK;");
  });
});
