import { assert, assertEquals } from "@std/assert";
import type {
  RespostaSessao,
  RespostaUsuario,
} from "../../cliente/src/tipos/protocolo.ts";
import {
  apenasRequisicoes,
  criarClienteDeTeste,
  exigirFalha,
  exigirSucesso,
  iniciarIntermediario,
  iniciarServidorReal,
} from "../auxiliares/ambiente.ts";

const SENHA = "SenhaSimultanea1";

Deno.test("20 cadastros simultâneos com o mesmo e-mail: um sucesso e dezenove 409", async () => {
  const servidor = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  try {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, indice) =>
        operacoes.cadastrar({
          nome: `Disputa ${indice}`,
          email: "disputa@teste.com",
          senha: SENHA,
        })),
    );
    assertEquals(resultados.filter((resultado) => resultado.ok).length, 1);
    const falhas = resultados.filter((resultado) => !resultado.ok);
    assertEquals(falhas.length, 19);
    for (const falha of falhas) {
      exigirFalha(falha, "http", 409);
    }
  } finally {
    await intermediario.encerrar();
    await servidor.encerrar();
  }
});

Deno.test("30 operações simultâneas variadas: todas corretas, em várias threads", async () => {
  const servidor = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  const { operacoes } = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  try {
    const preparados: {
      usuario: RespostaUsuario;
      sessao: RespostaSessao;
      email: string;
    }[] = [];
    for (let indice = 0; indice < 10; indice++) {
      const email = `base${indice}@teste.com`;
      const usuario = exigirSucesso(
        await operacoes.cadastrar({
          nome: `Base ${indice}`,
          email,
          senha: SENHA,
        }),
      );
      const sessao = exigirSucesso(
        await operacoes.entrar({ email, senha: SENHA }),
      );
      preparados.push({ usuario, sessao, email });
    }

    const [cadastros, logins, leituras] = await Promise.all([
      Promise.all(
        Array.from({ length: 10 }, (_, indice) =>
          operacoes.cadastrar({
            nome: `Novo ${indice}`,
            email: `novo${indice}@teste.com`,
            senha: SENHA,
          })),
      ),
      Promise.all(
        preparados.map((item) =>
          operacoes.entrar({ email: item.email, senha: SENHA })
        ),
      ),
      Promise.all(
        preparados.map((item) =>
          operacoes.lerCadastro(item.usuario.id, item.sessao.token)
        ),
      ),
    ]);

    cadastros.forEach((resultado, indice) => {
      assertEquals(exigirSucesso(resultado).email, `novo${indice}@teste.com`);
    });
    logins.forEach((resultado, indice) => {
      assertEquals(
        exigirSucesso(resultado).usuario,
        preparados[indice].usuario,
      );
    });
    leituras.forEach((resultado, indice) => {
      assertEquals(exigirSucesso(resultado), preparados[indice].usuario);
    });

    const threads = new Set(
      apenasRequisicoes(servidor.registros).map((registro) => registro.thread),
    );
    assert(
      threads.size >= 2,
      `esperadas ao menos 2 threads, houve ${threads.size}`,
    );
  } finally {
    await intermediario.encerrar();
    await servidor.encerrar();
  }
});
