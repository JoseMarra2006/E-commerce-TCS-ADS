import { assert, assertEquals } from "@std/assert";
import type { ConexaoServidor } from "../../cliente/src/api/cliente-http.ts";
import {
  criarClienteDeTeste,
  exigirFalha,
  exigirSucesso,
  iniciarIntermediario,
  iniciarServidorReal,
  obterPortaLivre,
} from "../auxiliares/ambiente.ts";

const SENHA = "SenhaAdversa1";
const MENSAGEM_CONEXAO_RECUSADA =
  "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução.";
const MENSAGEM_INTERMEDIARIO_FORA =
  "O intermediário do cliente não está em execução. Feche e abra o cliente novamente.";

Deno.test("servidor parado no meio do uso: o mesmo token volta a funcionar após reiniciar", async () => {
  const servidor = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  try {
    const usuario = exigirSucesso(
      await operacoes.cadastrar({
        nome: "Parada Teste",
        email: "parada@teste.com",
        senha: SENHA,
      }),
    );
    const sessao = exigirSucesso(
      await operacoes.entrar({ email: "parada@teste.com", senha: SENHA }),
    );
    exigirSucesso(await operacoes.lerCadastro(usuario.id, sessao.token));

    await servidor.parar();
    assertEquals(
      exigirFalha(
        await operacoes.lerCadastro(usuario.id, sessao.token),
        "rede",
        null,
      ),
      MENSAGEM_CONEXAO_RECUSADA,
    );

    await servidor.reiniciar();
    assertEquals(
      exigirSucesso(await operacoes.lerCadastro(usuario.id, sessao.token)),
      usuario,
    );
  } finally {
    await intermediario.encerrar();
    await servidor.encerrar();
  }
});

Deno.test("porta errada: falha de rede com conexão recusada", async () => {
  const intermediario = await iniciarIntermediario();
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: obterPortaLivre(),
  }));
  try {
    assertEquals(
      exigirFalha(
        await operacoes.entrar({ email: "a@teste.com", senha: SENHA }),
        "rede",
        null,
      ),
      MENSAGEM_CONEXAO_RECUSADA,
    );
  } finally {
    await intermediario.encerrar();
  }
});

Deno.test("intermediário reiniciado: o cliente obtém o novo token e repete o envio", async () => {
  const servidor = await iniciarServidorReal();
  const primeiro = await iniciarIntermediario();
  const porta = primeiro.porta;
  const { operacoes } = criarClienteDeTeste(porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  let atual = primeiro;
  try {
    exigirSucesso(
      await operacoes.cadastrar({
        nome: "Reinicio Teste",
        email: "reinicio@teste.com",
        senha: SENHA,
      }),
    );
    await primeiro.encerrar();
    atual = await iniciarIntermediario({ porta });
    assert(atual.token !== primeiro.token);

    const sessao = exigirSucesso(
      await operacoes.entrar({ email: "reinicio@teste.com", senha: SENHA }),
    );
    assert(sessao.token.length > 0);
  } finally {
    await atual.encerrar();
    await servidor.encerrar();
  }
});

Deno.test("intermediário fora do ar: falha do tipo intermediario", async () => {
  const servidor = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  try {
    exigirSucesso(await operacoes.verificarServidor());
    await intermediario.encerrar();
    assertEquals(
      exigirFalha(
        await operacoes.entrar({ email: "a@teste.com", senha: SENHA }),
        "intermediario",
        null,
      ),
      MENSAGEM_INTERMEDIARIO_FORA,
    );
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("troca de servidor: cada servidor tem seu próprio banco", async () => {
  const primeiro = await iniciarServidorReal();
  const segundo = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  let conexao: ConexaoServidor = { ip: "127.0.0.1", porta: primeiro.porta };
  const { operacoes } = criarClienteDeTeste(
    intermediario.porta,
    () => conexao,
  );
  const dados = {
    nome: "Troca Teste",
    email: "troca@teste.com",
    senha: SENHA,
  };
  try {
    exigirSucesso(await operacoes.cadastrar(dados));
    exigirSucesso(
      await operacoes.entrar({ email: dados.email, senha: dados.senha }),
    );

    conexao = { ip: "127.0.0.1", porta: segundo.porta };
    exigirFalha(
      await operacoes.entrar({ email: dados.email, senha: dados.senha }),
      "http",
      401,
    );
    exigirSucesso(await operacoes.cadastrar(dados));
    exigirSucesso(
      await operacoes.entrar({ email: dados.email, senha: dados.senha }),
    );
  } finally {
    await intermediario.encerrar();
    await primeiro.encerrar();
    await segundo.encerrar();
  }
});
