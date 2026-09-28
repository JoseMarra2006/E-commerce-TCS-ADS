import { assert, assertEquals } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import { GerenciadorPool } from "../src/pool/gerenciador-pool.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { criarUsuario } from "../src/modulos/usuarios/repositorio-usuarios.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

Deno.test("preparar o banco cria as tabelas antes de emitir servidor iniciado", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    const resultado = await controlador.iniciar(porta);
    assertEquals(resultado.ok, true);

    const registros = controlador.obterRegistros();
    const indicePreparado = registros.findIndex(
      (registro) =>
        registro.tipo === "sistema" &&
        registro.mensagem === "Banco de dados preparado.",
    );
    const indiceIniciado = registros.findIndex(
      (registro) =>
        registro.tipo === "sistema" &&
        registro.mensagem.startsWith("Servidor iniciado na porta"),
    );

    assert(indicePreparado !== -1);
    assert(indiceIniciado !== -1);
    assert(indicePreparado < indiceIniciado);

    await controlador.parar();

    const conexaoVerificacao = abrirConexao(caminhoBanco);
    try {
      const tabelas = conexaoVerificacao
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('usuarios', 'sessoes');",
        )
        .all() as { name: string }[];
      assertEquals(tabelas.length, 2);
    } finally {
      fecharConexao(conexaoVerificacao);
    }
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("threads ficam prontas e atendem requisicoes com o banco integrado", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    await controlador.iniciar(porta);

    const threads = controlador.obterEstado().threads;
    assert(threads.length > 0);
    assert(threads.every((thread) => thread.pronta));

    const respostas = await Promise.all(
      Array.from(
        { length: 30 },
        () => fetch(`http://127.0.0.1:${porta}/api/v1/inexistente`),
      ),
    );

    for (const resposta of respostas) {
      assertEquals(resposta.status, 404);
      assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), "*");
      await resposta.json();
    }
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("parar libera todas as conexoes do banco", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  await controlador.iniciar(porta);
  await controlador.parar();

  removerBancoTemporario(caminhoBanco);

  let existeArquivo = true;
  try {
    Deno.statSync(caminhoBanco);
  } catch (erro) {
    if (erro instanceof Deno.errors.NotFound) {
      existeArquivo = false;
    } else {
      throw erro;
    }
  }
  assertEquals(existeArquivo, false);
});

Deno.test("reiniciar com o mesmo banco preserva os dados gravados", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    await controlador.iniciar(porta);
    await controlador.parar();

    const conexaoEscrita = abrirConexao(caminhoBanco);
    try {
      criarUsuario(conexaoEscrita, {
        nome: "Persistente",
        email: "persistente@exemplo.com",
        senhaHash: "hash-teste",
        senhaSalt: "salt-teste",
      });
    } finally {
      fecharConexao(conexaoEscrita);
    }

    const controladorNovo = new ControladorServidor({ caminhoBanco });
    const resultadoNovo = await controladorNovo.iniciar(porta);
    assertEquals(resultadoNovo.ok, true);
    await controladorNovo.parar();

    const conexaoVerificacao = abrirConexao(caminhoBanco);
    try {
      const linha = conexaoVerificacao
        .prepare("SELECT nome FROM usuarios WHERE email = ?;")
        .get("persistente@exemplo.com") as { nome: string } | undefined;
      assert(linha !== undefined);
      assertEquals(linha.nome, "Persistente");
    } finally {
      fecharConexao(conexaoVerificacao);
    }
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("falha na preparacao do banco impede a criacao de threads", async () => {
  const caminhoArquivoBloqueador = criarCaminhoBancoTemporario().replace(
    /\.db$/,
    ".txt",
  );
  Deno.writeTextFileSync(caminhoArquivoBloqueador, "bloqueio");

  const caminhoBanco = `${caminhoArquivoBloqueador}/banco.db`;
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    const resultado = await controlador.iniciar(porta);
    assertEquals(resultado.ok, false);
    assert(
      resultado.mensagem.startsWith(
        "Não foi possível preparar o banco de dados:",
      ),
    );
    assertEquals(controlador.obterEstado().status, "erro");
    assertEquals(controlador.obterEstado().threads.length, 0);
  } finally {
    let arquivoExiste = true;
    try {
      Deno.statSync(caminhoArquivoBloqueador);
    } catch {
      arquivoExiste = false;
    }
    if (arquivoExiste) {
      Deno.removeSync(caminhoArquivoBloqueador);
    }
  }
});

Deno.test("falha ao abrir o banco nas threads rejeita a inicializacao do pool", async () => {
  const caminhoBase = criarCaminhoBancoTemporario();
  const caminhoInvalido = `${caminhoBase}-pasta-inexistente/banco.db`;

  const pool = new GerenciadorPool();

  let erroCapturado: unknown;
  try {
    await pool.iniciar(caminhoInvalido);
  } catch (erro) {
    erroCapturado = erro;
  }

  assert(erroCapturado instanceof Error);
  assert(
    erroCapturado.message.startsWith(
      "Não foi possível abrir o banco de dados nas threads:",
    ),
  );
  assertEquals(pool.obterEstadoThreads().length, 0);
});

Deno.test("gravacao paralela real de 4 trabalhadores nao perde nenhum usuario", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const conexaoPreparacao = abrirConexao(caminhoBanco);
  try {
    executarMigracoes(conexaoPreparacao);
  } finally {
    fecharConexao(conexaoPreparacao);
  }

  const prefixos = ["a", "b", "c", "d"];

  try {
    const resultados = await Promise.all(
      prefixos.map((prefixo) =>
        new Promise<{ ok: boolean; mensagem?: string }>((resolve, reject) => {
          const worker = new Worker(
            new URL(
              "./auxiliares/trabalhador-escrita-teste.ts",
              import.meta.url,
            ).href,
            { type: "module" },
          );

          worker.onmessage = (evento: MessageEvent<unknown>) => {
            const dado = evento.data as { ok: boolean; mensagem?: string };
            worker.terminate();
            resolve(dado);
          };

          worker.onerror = (evento: ErrorEvent) => {
            evento.preventDefault();
            worker.terminate();
            reject(new Error(evento.message));
          };

          worker.postMessage({ caminhoBanco, prefixo, quantidade: 25 });
        })
      ),
    );

    for (const resultado of resultados) {
      assertEquals(resultado.ok, true, resultado.mensagem);
    }

    const conexaoVerificacao = abrirConexao(caminhoBanco);
    try {
      const total = conexaoVerificacao
        .prepare("SELECT COUNT(*) AS total FROM usuarios;")
        .get() as { total: number };
      assertEquals(total.total, 100);
    } finally {
      fecharConexao(conexaoVerificacao);
    }
  } finally {
    removerBancoTemporario(caminhoBanco);
  }
});
