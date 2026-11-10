import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import type { Registro } from "../src/estado.ts";
import {
  MENSAGEM_ADM_PADRAO_CRIADO,
  MENSAGEM_ADM_PADRAO_EXISTENTE,
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
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";

interface Ambiente {
  caminhoBanco: string;
  caminhoSegredoJwt: string;
}

interface ControladorObservado {
  controlador: ControladorServidor;
  registros: Registro[];
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

async function comAmbiente(fn: (ambiente: Ambiente) => Promise<void>) {
  const ambiente = {
    caminhoBanco: criarCaminhoBancoTemporario(),
    caminhoSegredoJwt: criarCaminhoSegredoTemporario(),
  };
  try {
    await fn(ambiente);
  } finally {
    removerBancoTemporario(ambiente.caminhoBanco);
    removerSegredoTemporario(ambiente.caminhoSegredoJwt);
  }
}

function criarControlador(ambiente: Ambiente): ControladorObservado {
  const controlador = new ControladorServidor(ambiente);
  const registros: Registro[] = [];
  controlador.addEventListener("registro", (evento) => {
    registros.push((evento as CustomEvent<Registro>).detail);
  });
  return { controlador, registros };
}

function comConexao<T>(
  caminhoBanco: string,
  fn: (conexao: ConexaoBanco) => T,
): T {
  const conexao = abrirConexao(caminhoBanco);
  try {
    executarMigracoes(conexao);
    return fn(conexao);
  } finally {
    fecharConexao(conexao);
  }
}

function lerUsuarios(caminhoBanco: string): UsuarioRegistro[] {
  return comConexao(caminhoBanco, (conexao) => listarUsuarios(conexao));
}

function mensagensSistema(registros: Registro[]): string[] {
  return registros.flatMap((registro) =>
    registro.tipo === "sistema" ? [registro.mensagem] : []
  );
}

function verificarLogSemSegredos(
  registros: Registro[],
  usuarios: UsuarioRegistro[],
): void {
  const texto = JSON.stringify(registros);
  assert(!texto.includes("admin123"), "o log contém a senha do ADM");
  for (const usuario of usuarios) {
    assert(!texto.includes(usuario.senhaHash), "o log contém um hash");
    assert(!texto.includes(usuario.senhaSalt), "o log contém um salt");
  }
}

async function entrar(
  porta: number,
  email: string,
  senha: string,
): Promise<Response> {
  return await fetch(`http://127.0.0.1:${porta}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
}

Deno.test("iniciar com banco vazio cria só o ADM padrão e o login dele funciona", async () => {
  await comAmbiente(async (ambiente) => {
    const { controlador, registros } = criarControlador(ambiente);
    const porta = obterPortaLivre();
    const resultado = await controlador.iniciar(porta);
    try {
      assertEquals(resultado.ok, true, resultado.mensagem);

      const usuarios = lerUsuarios(ambiente.caminhoBanco);
      assertEquals(usuarios.length, 1);
      assertEquals(usuarios[0].id, 1);
      assertEquals(usuarios[0].email, "adm@teste.com");
      assertEquals(usuarios[0].papel, "administrador");

      const resposta = await entrar(porta, "adm@teste.com", "admin123");
      assertEquals(resposta.status, 201);
      const corpo = await resposta.json();
      assertEquals(typeof corpo.token, "string");
      assert(corpo.token.length > 0);
      assertEquals(corpo.usuario.id, 1);

      const mensagens = mensagensSistema(registros);
      assert(mensagens.includes(MENSAGEM_ADM_PADRAO_CRIADO));
      assert(!mensagens.includes(MENSAGEM_ADM_PADRAO_EXISTENTE));
      verificarLogSemSegredos(registros, usuarios);
    } finally {
      await controlador.parar();
    }
  });
});

Deno.test("reiniciar com o mesmo banco mantém um só ADM e registra o aviso", async () => {
  await comAmbiente(async (ambiente) => {
    const primeiro = criarControlador(ambiente);
    const resultadoPrimeiro = await primeiro.controlador.iniciar(
      obterPortaLivre(),
    );
    assertEquals(resultadoPrimeiro.ok, true, resultadoPrimeiro.mensagem);
    await primeiro.controlador.parar();
    const antes = lerUsuarios(ambiente.caminhoBanco);

    const segundo = criarControlador(ambiente);
    const resultadoSegundo = await segundo.controlador.iniciar(
      obterPortaLivre(),
    );
    try {
      assertEquals(resultadoSegundo.ok, true, resultadoSegundo.mensagem);
      const depois = lerUsuarios(ambiente.caminhoBanco);
      assertEquals(depois.length, 1);
      assertEquals(depois, antes);
      const mensagens = mensagensSistema(segundo.registros);
      assert(mensagens.includes(MENSAGEM_ADM_PADRAO_EXISTENTE));
      assert(!mensagens.includes(MENSAGEM_ADM_PADRAO_CRIADO));
      verificarLogSemSegredos(segundo.registros, depois);
    } finally {
      await segundo.controlador.parar();
    }
  });
});

Deno.test("iniciar e parar o mesmo controlador duas vezes mantém um só ADM", async () => {
  await comAmbiente(async (ambiente) => {
    const { controlador } = criarControlador(ambiente);
    for (let vez = 0; vez < 2; vez++) {
      const resultado = await controlador.iniciar(obterPortaLivre());
      assertEquals(resultado.ok, true, resultado.mensagem);
      await controlador.parar();
    }
    const usuarios = lerUsuarios(ambiente.caminhoBanco);
    assertEquals(usuarios.length, 1);
    assertEquals(usuarios[0].papel, "administrador");
  });
});

Deno.test("adm@teste.com já cadastrado como comum não é alterado ao iniciar", async () => {
  await comAmbiente(async (ambiente) => {
    const { hash, salt } = await gerarHashSenha("comum123");
    const existente = comConexao(
      ambiente.caminhoBanco,
      (conexao) =>
        criarUsuario(conexao, {
          nome: "Pessoa Comum",
          email: "Adm@Teste.com",
          senhaHash: hash,
          senhaSalt: salt,
        }),
    );

    const { controlador, registros } = criarControlador(ambiente);
    const porta = obterPortaLivre();
    const resultado = await controlador.iniciar(porta);
    try {
      assertEquals(resultado.ok, true, resultado.mensagem);
      const usuarios = lerUsuarios(ambiente.caminhoBanco);
      assertEquals(usuarios, [existente]);
      assertEquals(usuarios[0].papel, "comum");
      assert(
        await verificarSenha(
          "comum123",
          usuarios[0].senhaHash,
          usuarios[0].senhaSalt,
        ),
      );

      const recusado = await entrar(porta, "adm@teste.com", "admin123");
      assertEquals(recusado.status, 401);
      await recusado.body?.cancel();

      const mensagens = mensagensSistema(registros);
      assert(mensagens.includes(MENSAGEM_ADM_PADRAO_EXISTENTE));
      assert(!mensagens.includes(MENSAGEM_ADM_PADRAO_CRIADO));
      verificarLogSemSegredos(registros, usuarios);
    } finally {
      await controlador.parar();
    }
  });
});

Deno.test("falha do ADM padrão impede a inicialização e fecha a conexão", async () => {
  await comAmbiente(async (ambiente) => {
    comConexao(ambiente.caminhoBanco, (conexao) => {
      conexao.exec(
        "CREATE TRIGGER teste_falha BEFORE INSERT ON usuarios " +
          "BEGIN SELECT RAISE(ABORT, 'falha simulada do banco'); END;",
      );
    });

    const { controlador, registros } = criarControlador(ambiente);
    const resultado = await controlador.iniciar(obterPortaLivre());

    assertEquals(resultado.ok, false);
    assert(
      resultado.mensagem.startsWith(
        "Não foi possível preparar o banco de dados",
      ),
    );
    assert(resultado.mensagem.includes("falha simulada do banco"));
    const estado = controlador.obterEstado();
    assertEquals(estado.status, "erro");
    assertEquals(estado.threads, []);
    assertEquals(estado.porta, null);
    assert(!mensagensSistema(registros).includes(MENSAGEM_ADM_PADRAO_CRIADO));
    assert(!JSON.stringify(registros).includes("admin123"));

    let walExiste = true;
    try {
      Deno.statSync(`${ambiente.caminhoBanco}-wal`);
    } catch (erro) {
      if (!(erro instanceof Deno.errors.NotFound)) {
        throw erro;
      }
      walExiste = false;
    }
    assertEquals(walExiste, false, "a conexão do controlador ficou aberta");
    assertEquals(lerUsuarios(ambiente.caminhoBanco), []);
  });
});
