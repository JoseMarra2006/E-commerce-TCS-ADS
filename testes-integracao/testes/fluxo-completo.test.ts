import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  apenasRequisicoes,
  criarClienteDeTeste,
  exigirFalha,
  exigirSucesso,
  iniciarIntermediario,
  iniciarServidorReal,
} from "../auxiliares/ambiente.ts";

const SENHA_INICIAL = "SenhaInicial1";
const SENHA_NOVA = "SenhaNovaXyz9";
const EMAIL = "maria.fluxo@teste.com";

function lerCorpo(texto: string | null): Record<string, unknown> {
  assert(texto !== null, "o corpo recebido deveria existir");
  const dados: unknown = JSON.parse(texto);
  assert(typeof dados === "object" && dados !== null && !Array.isArray(dados));
  return { ...dados };
}

Deno.test("fluxo completo: cliente, intermediário, servidor real e banco", async () => {
  const servidor = await iniciarServidorReal();
  const intermediario = await iniciarIntermediario();
  const cliente = criarClienteDeTeste(intermediario.porta, () => ({
    ip: "127.0.0.1",
    porta: servidor.porta,
  }));
  const { operacoes } = cliente;
  const tokens: string[] = [];

  try {
    const verificacao = exigirSucesso(await operacoes.verificarServidor());
    assertEquals(verificacao.status, 405);

    const cadastrado = exigirSucesso(
      await operacoes.cadastrar({
        nome: "Maria Fluxo",
        email: EMAIL,
        senha: SENHA_INICIAL,
      }),
    );
    assertEquals(cadastrado.nome, "Maria Fluxo");
    assertEquals(cadastrado.email, EMAIL);
    assert(Number.isInteger(cadastrado.id) && cadastrado.id > 0);

    const mensagemDuplicado = exigirFalha(
      await operacoes.cadastrar({
        nome: "Maria Outra",
        email: EMAIL.toUpperCase(),
        senha: SENHA_INICIAL,
      }),
      "http",
      409,
    );
    assertNotEquals(mensagemDuplicado.length, 0);
    const registroDuplicado = apenasRequisicoes(servidor.registros).findLast(
      (registro) => registro.metodo === "POST" && registro.status === 409,
    );
    assert(registroDuplicado !== undefined);
    const corpoDuplicado: unknown = JSON.parse(
      registroDuplicado.corpoEnviado ?? "",
    );
    assert(
      typeof corpoDuplicado === "object" && corpoDuplicado !== null &&
        "mensagem" in corpoDuplicado,
    );
    assertEquals(corpoDuplicado.mensagem, mensagemDuplicado);

    const sessao = exigirSucesso(
      await operacoes.entrar({ email: EMAIL, senha: SENHA_INICIAL }),
    );
    tokens.push(sessao.token);
    assertEquals(sessao.usuario, cadastrado);
    assert(sessao.id.length > 0 && sessao.token.length > 0);

    const lido = exigirSucesso(
      await operacoes.lerCadastro(cadastrado.id, sessao.token),
    );
    assertEquals(lido, cadastrado);

    const aposNome = exigirSucesso(
      await operacoes.atualizarCadastro(cadastrado.id, sessao.token, {
        nome: "Maria Renomeada",
      }),
    );
    assertEquals(aposNome, {
      id: cadastrado.id,
      nome: "Maria Renomeada",
      email: EMAIL,
    });
    const registroPatch = apenasRequisicoes(servidor.registros).findLast(
      (registro) => registro.metodo === "PATCH",
    );
    assert(registroPatch !== undefined);
    assertEquals(Object.keys(lerCorpo(registroPatch.corpoRecebido)), ["nome"]);

    exigirSucesso(
      await operacoes.atualizarCadastro(cadastrado.id, sessao.token, {
        senha: SENHA_NOVA,
      }),
    );
    exigirFalha(
      await operacoes.entrar({ email: EMAIL, senha: SENHA_INICIAL }),
      "http",
      401,
    );
    const sessaoNova = exigirSucesso(
      await operacoes.entrar({ email: EMAIL, senha: SENHA_NOVA }),
    );
    tokens.push(sessaoNova.token);

    exigirSucesso(await operacoes.sair(sessaoNova.id, sessaoNova.token));
    exigirFalha(
      await operacoes.lerCadastro(cadastrado.id, sessaoNova.token),
      "http",
      401,
    );
    exigirSucesso(await operacoes.lerCadastro(cadastrado.id, sessao.token));

    const sessaoFinal = exigirSucesso(
      await operacoes.entrar({ email: EMAIL, senha: SENHA_NOVA }),
    );
    tokens.push(sessaoFinal.token);
    exigirSucesso(
      await operacoes.excluirCadastro(cadastrado.id, sessaoFinal.token),
    );
    exigirFalha(
      await operacoes.lerCadastro(cadastrado.id, sessaoFinal.token),
      "http",
      401,
    );
    exigirFalha(
      await operacoes.entrar({ email: EMAIL, senha: SENHA_NOVA }),
      "http",
      401,
    );

    const textoClientes = JSON.stringify(cliente.registros);
    const textoServidor = JSON.stringify(servidor.registros);
    for (const texto of [textoClientes, textoServidor]) {
      for (const senha of [SENHA_INICIAL, SENHA_NOVA]) {
        assertEquals(texto.includes(senha), false, "senha em texto puro");
      }
      for (const token of tokens) {
        assertEquals(texto.includes(token), false, "token completo exposto");
      }
    }

    const restantes = apenasRequisicoes(servidor.registros);
    const comResposta = cliente.registros.filter(
      (registro) => registro.status !== null,
    );
    assert(comResposta.length > 0);
    for (const registro of comResposta) {
      const caminho = new URL(registro.url).pathname;
      const indice = restantes.findIndex(
        (item) =>
          item.metodo === registro.metodo && item.caminho === caminho &&
          item.status === registro.status,
      );
      assert(
        indice >= 0,
        `sem correspondente no servidor: ${registro.metodo} ${caminho} ${registro.status}`,
      );
      restantes.splice(indice, 1);
    }
  } finally {
    await intermediario.encerrar();
    await servidor.encerrar();
  }
});
