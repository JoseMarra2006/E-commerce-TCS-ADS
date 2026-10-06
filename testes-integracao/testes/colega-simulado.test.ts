import { assert, assertEquals } from "@std/assert";
import {
  criarClienteDeTeste,
  exigirFalha,
  exigirSucesso,
  iniciarIntermediario,
  type OpcoesIntermediario,
} from "../auxiliares/ambiente.ts";
import {
  iniciarServidorColega,
  type ModoColega,
  type OpcoesColega,
} from "../colega-simulado/servidor-colega.ts";

const EMAIL = "joao.colega@teste.com";
const SENHA = "SenhaColega1";

async function comColega(
  modo: ModoColega,
  opcoesColega: OpcoesColega,
  opcoesIntermediario: OpcoesIntermediario,
  corpo: (contexto: {
    operacoes: ReturnType<typeof criarClienteDeTeste>["operacoes"];
    obterToken: (email: string) => string | null;
    porta: number;
  }) => Promise<void>,
): Promise<void> {
  const colega = await iniciarServidorColega(modo, undefined, opcoesColega);
  const intermediario = await iniciarIntermediario(opcoesIntermediario);
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: colega.porta,
  }));
  try {
    await corpo({
      operacoes,
      obterToken: colega.obterToken,
      porta: colega.porta,
    });
  } finally {
    await intermediario.encerrar();
    await colega.encerrar();
  }
}

async function percorrerFluxo(
  operacoes: ReturnType<typeof criarClienteDeTeste>["operacoes"],
) {
  const cadastrado = exigirSucesso(
    await operacoes.cadastrar({
      nome: "João Colega",
      email: EMAIL,
      senha: SENHA,
    }),
  );
  exigirFalha(
    await operacoes.cadastrar({
      nome: "João Colega",
      email: EMAIL,
      senha: SENHA,
    }),
    "http",
    409,
  );
  const sessao = exigirSucesso(
    await operacoes.entrar({ email: EMAIL, senha: SENHA }),
  );
  const lido = exigirSucesso(
    await operacoes.lerCadastro(cadastrado.id, sessao.token),
  );
  const atualizado = exigirSucesso(
    await operacoes.atualizarCadastro(cadastrado.id, sessao.token, {
      nome: "João Atualizado",
    }),
  );
  exigirSucesso(await operacoes.sair(sessao.id, sessao.token));
  exigirFalha(
    await operacoes.lerCadastro(cadastrado.id, sessao.token),
    "http",
    401,
  );
  const sessaoFinal = exigirSucesso(
    await operacoes.entrar({ email: EMAIL, senha: SENHA }),
  );
  exigirSucesso(
    await operacoes.excluirCadastro(cadastrado.id, sessaoFinal.token),
  );
  exigirFalha(
    await operacoes.entrar({ email: EMAIL, senha: SENHA }),
    "http",
    401,
  );
  return { cadastrado, sessao, lido, atualizado };
}

Deno.test("colega correto: fluxo completo funciona sem CORS", async () => {
  await comColega("correto", {}, {}, async ({ operacoes, porta }) => {
    const direta = await fetch(`http://127.0.0.1:${porta}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@teste.com", senha: "SenhaX123" }),
    });
    await direta.body?.cancel();
    assertEquals(direta.status, 401);
    assertEquals(direta.headers.get("Access-Control-Allow-Origin"), null);

    const { cadastrado, lido, atualizado } = await percorrerFluxo(operacoes);
    assertEquals(lido, cadastrado);
    assertEquals(atualizado.nome, "João Atualizado");
  });
});

Deno.test("colega divergente: tolera status, id em texto e campos extras", async () => {
  await comColega("divergente", {}, {}, async ({ operacoes }) => {
    const { cadastrado, sessao, lido, atualizado } = await percorrerFluxo(
      operacoes,
    );
    for (const usuario of [cadastrado, sessao.usuario, lido, atualizado]) {
      assertEquals(Object.keys(usuario).sort(), ["email", "id", "nome"]);
      assertEquals(typeof usuario.id, "number");
    }
    assertEquals(Object.keys(sessao).sort(), ["id", "token", "usuario"]);
  });
});

Deno.test("colega quebrado: cada operação falha de forma controlada", async () => {
  await comColega("quebrado", {}, {}, async ({ operacoes, obterToken }) => {
    const mensagemFora = "Resposta do servidor fora do protocolo.";

    assertEquals(
      exigirFalha(
        await operacoes.cadastrar({
          nome: "Ana Quebrada",
          email: EMAIL,
          senha: SENHA,
        }),
        "fora_protocolo",
        201,
      ),
      mensagemFora,
    );
    assertEquals(
      exigirFalha(
        await operacoes.entrar({ email: EMAIL, senha: SENHA }),
        "fora_protocolo",
        201,
      ),
      mensagemFora,
    );
    assertEquals(
      exigirFalha(
        await operacoes.cadastrar({
          nome: "Ana Quebrada",
          email: EMAIL,
          senha: SENHA,
        }),
        "http",
        409,
      ),
      "Os dados informados entram em conflito com um cadastro existente.",
    );
    assertEquals(
      exigirFalha(
        await operacoes.entrar({ email: EMAIL, senha: "OutraSenha1" }),
        "http",
        401,
      ),
      "Não autorizado. Faça login novamente.",
    );
    assertEquals(
      exigirFalha(
        await operacoes.lerCadastro(1, "token-invalido"),
        "http",
        401,
      ),
      "Não autorizado. Faça login novamente.",
    );

    const token = obterToken(EMAIL);
    assert(token !== null);
    assertEquals(
      exigirFalha(await operacoes.lerCadastro(1, token), "fora_protocolo", 200),
      mensagemFora,
    );
    assertEquals(
      exigirFalha(await operacoes.lerCadastro(2, token), "http", 403),
      "Você não tem permissão para realizar esta operação.",
    );
    exigirSucesso(await operacoes.excluirCadastro(1, token));
    assertEquals(
      exigirFalha(await operacoes.excluirCadastro(1, token), "http", 401),
      "Não autorizado. Faça login novamente.",
    );
  });
});

Deno.test("colega lento: tempo limite do intermediário vira falha de rede", async () => {
  await comColega(
    "lento",
    { atrasoMs: 1500 },
    { opcoesEncaminhamento: { tempoLimiteMs: 300 } },
    async ({ operacoes }) => {
      const mensagem = exigirFalha(
        await operacoes.cadastrar({
          nome: "Lento Teste",
          email: EMAIL,
          senha: SENHA,
        }),
        "rede",
        null,
      );
      assertEquals(
        mensagem,
        "O servidor não respondeu a tempo. Verifique a conexão e tente novamente.",
      );
    },
  );
});

Deno.test("colega enorme: resposta acima do limite vira falha de rede", async () => {
  await comColega("enorme", {}, {}, async ({ operacoes }) => {
    const cadastrado = exigirSucesso(
      await operacoes.cadastrar({
        nome: "Enorme Teste",
        email: EMAIL,
        senha: SENHA,
      }),
    );
    const sessao = exigirSucesso(
      await operacoes.entrar({ email: EMAIL, senha: SENHA }),
    );
    const mensagem = exigirFalha(
      await operacoes.lerCadastro(cadastrado.id, sessao.token),
      "rede",
      null,
    );
    assertEquals(
      mensagem,
      "A resposta do servidor é grande demais para ser processada.",
    );
  });
});
