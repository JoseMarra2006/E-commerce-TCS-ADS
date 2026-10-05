import { describe, expect, it } from "vitest";
import { criarClienteHttp } from "../src/api/cliente-http.ts";
import type { ClienteHttp, ResultadoHttp } from "../src/api/cliente-http.ts";
import type { ErroRede } from "../src/tipos/intermediario.ts";
import { criarOperacoes } from "../src/api/operacoes.ts";
import {
  criarIntermediarioFalso,
  respostaJson,
  resultadoErroRede,
  resultadoResposta,
} from "./auxiliares-api.ts";

const conexao = { ip: "10.20.50.123", porta: 20000 };
const usuario = { id: 5, nome: "Ana Lima", email: "ana@exemplo.com" };

function operacoesCom(status: number, corpo: string) {
  const falso = criarIntermediarioFalso(() => respostaJson(resultadoResposta(status, corpo)));
  const cliente = criarClienteHttp({ obterConexao: () => conexao, buscar: falso.buscar });
  return { operacoes: criarOperacoes(cliente), falso };
}

function ultimoPedido(falso: ReturnType<typeof criarIntermediarioFalso>): unknown {
  return falso.pedidosEnviados().at(-1);
}

function operacoesFixas(resultado: ResultadoHttp) {
  const cliente: ClienteHttp = { enviar: () => Promise.resolve(resultado) };
  return criarOperacoes(cliente);
}

describe("operações: montagem das requisições", () => {
  it("cadastrar", async () => {
    const { operacoes, falso } = operacoesCom(201, JSON.stringify(usuario));
    const resultado = await operacoes.cadastrar({ nome: "Ana Lima", email: "ana@exemplo.com", senha: "abc123" });
    expect(resultado).toEqual({ ok: true, dados: usuario });
    expect(ultimoPedido(falso)).toEqual({
      ip: conexao.ip,
      porta: conexao.porta,
      metodo: "POST",
      caminho: "/api/v1/users",
      token: null,
      corpo: '{"nome":"Ana Lima","email":"ana@exemplo.com","senha":"abc123"}',
    });
  });

  it("entrar", async () => {
    const { operacoes, falso } = operacoesCom(
      201,
      JSON.stringify({ id: "uuid-1", token: "jwt", usuario }),
    );
    const resultado = await operacoes.entrar({ email: "ana@exemplo.com", senha: "abc123" });
    expect(resultado).toEqual({ ok: true, dados: { id: "uuid-1", token: "jwt", usuario } });
    expect(ultimoPedido(falso)).toMatchObject({
      metodo: "POST",
      caminho: "/api/v1/sessions",
      token: null,
      corpo: '{"email":"ana@exemplo.com","senha":"abc123"}',
    });
  });

  it("lerCadastro", async () => {
    const { operacoes, falso } = operacoesCom(200, JSON.stringify(usuario));
    await operacoes.lerCadastro(5, "jwt-token");
    expect(ultimoPedido(falso)).toMatchObject({
      metodo: "GET",
      caminho: "/api/v1/users/5",
      token: "jwt-token",
      corpo: null,
    });
  });

  it("atualizarCadastro envia somente os campos presentes", async () => {
    const { operacoes, falso } = operacoesCom(200, JSON.stringify(usuario));
    await operacoes.atualizarCadastro(5, "jwt-token", { nome: "Novo Nome" });
    expect(ultimoPedido(falso)).toMatchObject({
      metodo: "PATCH",
      caminho: "/api/v1/users/5",
      token: "jwt-token",
      corpo: '{"nome":"Novo Nome"}',
    });
  });

  it("excluirCadastro", async () => {
    const { operacoes, falso } = operacoesCom(204, "");
    const resultado = await operacoes.excluirCadastro(5, "jwt-token");
    expect(resultado).toEqual({ ok: true, dados: true });
    expect(ultimoPedido(falso)).toMatchObject({
      metodo: "DELETE",
      caminho: "/api/v1/users/5",
      token: "jwt-token",
      corpo: null,
    });
  });

  it("sair codifica o id da sessão no caminho", async () => {
    const { operacoes, falso } = operacoesCom(204, "");
    await operacoes.sair("a/b c?d#e", "jwt-token");
    expect(ultimoPedido(falso)).toMatchObject({
      metodo: "DELETE",
      caminho: "/api/v1/sessions/a%2Fb%20c%3Fd%23e",
      token: "jwt-token",
      corpo: null,
    });
  });
});

describe("operações: leitura tolerante das respostas", () => {
  it("aceita 200 e 201 em cadastrar e entrar", async () => {
    for (const status of [200, 201]) {
      const cadastro = await operacoesCom(status, JSON.stringify(usuario)).operacoes.cadastrar({
        nome: "Ana Lima",
        email: "ana@exemplo.com",
        senha: "abc123",
      });
      expect(cadastro.ok).toBe(true);
      const sessao = await operacoesCom(
        status,
        JSON.stringify({ id: "s", token: "t", usuario }),
      ).operacoes.entrar({ email: "ana@exemplo.com", senha: "abc123" });
      expect(sessao.ok).toBe(true);
    }
  });

  it("ignora campos extras e devolve somente os do protocolo", async () => {
    const extra = { ...usuario, senha: "x", papel: "comum" };
    const { operacoes } = operacoesCom(
      200,
      JSON.stringify({ id: "s", token: "t", usuario: extra, extra: 1 }),
    );
    const resultado = await operacoes.entrar({ email: "ana@exemplo.com", senha: "abc123" });
    expect(resultado).toEqual({ ok: true, dados: { id: "s", token: "t", usuario } });
    expect(Object.keys(resultado.ok ? resultado.dados : {}).sort()).toEqual(["id", "token", "usuario"]);
  });

  it("converte id de usuário em texto e id de sessão numérico", async () => {
    const lido = await operacoesCom(
      200,
      JSON.stringify({ ...usuario, id: "5" }),
    ).operacoes.lerCadastro(5, "t");
    expect(lido).toEqual({ ok: true, dados: usuario });

    const sessao = await operacoesCom(
      200,
      JSON.stringify({ id: 42, token: "t", usuario }),
    ).operacoes.entrar({ email: "ana@exemplo.com", senha: "abc123" });
    expect(sessao).toEqual({ ok: true, dados: { id: "42", token: "t", usuario } });
  });

  it("respostas fora do protocolo viram fora_protocolo com o status recebido", async () => {
    const mensagem = "Resposta do servidor fora do protocolo.";
    const casos: Array<[number, string]> = [
      [201, ""],
      [201, "{nao json"],
      [200, JSON.stringify({ id: "s", usuario })],
      [200, JSON.stringify({ id: "s", token: "t" })],
      [200, JSON.stringify({ id: "s", token: "t", usuario: { ...usuario, nome: 123 } })],
      [200, JSON.stringify({ id: "s", token: "", usuario })],
    ];
    for (const [status, corpo] of casos) {
      const resultado = await operacoesCom(status, corpo).operacoes.entrar({
        email: "ana@exemplo.com",
        senha: "abc123",
      });
      expect(resultado).toEqual({ ok: false, tipo: "fora_protocolo", status, mensagem });
    }
    const usuarioInvalido = await operacoesCom(200, JSON.stringify({ id: 0, nome: "A", email: "b" }))
      .operacoes.lerCadastro(5, "t");
    expect(usuarioInvalido).toMatchObject({ ok: false, tipo: "fora_protocolo", status: 200 });
  });

  it("excluirCadastro e sair aceitam 204 sem corpo e 200 com corpo", async () => {
    const casos: Array<[number, string]> = [[204, ""], [200, '{"qualquer":"coisa"}'], [200, "texto"]];
    for (const [status, corpo] of casos) {
      const { operacoes } = operacoesCom(status, corpo);
      expect(await operacoes.excluirCadastro(5, "t")).toEqual({ ok: true, dados: true });
      expect(await operacoes.sair("s", "t")).toEqual({ ok: true, dados: true });
    }
  });
});

describe("operações: repasse de erros", () => {
  it("repassa erros http, rede, intermediario e conexao sem alteração", async () => {
    const erros: ResultadoHttp[] = [
      { ok: false, tipo: "http", status: 401, mensagem: "m1", corpoTexto: "{}" },
      { ok: false, tipo: "rede", status: null, mensagem: "m2", corpoTexto: null },
      { ok: false, tipo: "intermediario", status: null, mensagem: "m3", corpoTexto: null },
      { ok: false, tipo: "conexao", status: null, mensagem: "m4", corpoTexto: null },
    ];
    for (const erro of erros) {
      if (erro.ok) {
        continue;
      }
      const operacoes = operacoesFixas(erro);
      const esperado = { ok: false, tipo: erro.tipo, status: erro.status, mensagem: erro.mensagem };
      expect(await operacoes.cadastrar({ nome: "Ana", email: "a@b.com", senha: "abc123" })).toEqual(esperado);
      expect(await operacoes.entrar({ email: "a@b.com", senha: "abc123" })).toEqual(esperado);
      expect(await operacoes.lerCadastro(1, "t")).toEqual(esperado);
      expect(await operacoes.atualizarCadastro(1, "t", { nome: "Ana" })).toEqual(esperado);
      expect(await operacoes.excluirCadastro(1, "t")).toEqual(esperado);
      expect(await operacoes.sair("s", "t")).toEqual(esperado);
    }
  });

  it("repassa erro de rede vindo do intermediário de ponta a ponta", async () => {
    const falso = criarIntermediarioFalso(() => respostaJson(resultadoErroRede("tempo_esgotado")));
    const operacoes = criarOperacoes(
      criarClienteHttp({ obterConexao: () => conexao, buscar: falso.buscar }),
    );
    const resultado = await operacoes.lerCadastro(1, "t");
    expect(resultado).toMatchObject({ ok: false, tipo: "rede", status: null });
  });
});

describe("operações: verificarServidor", () => {
  it("envia GET /api/v1/sessions sem token e sem corpo", async () => {
    const { operacoes, falso } = operacoesCom(405, '{"mensagem":"Método não permitido."}');
    await operacoes.verificarServidor();
    expect(ultimoPedido(falso)).toEqual({
      ip: conexao.ip,
      porta: conexao.porta,
      metodo: "GET",
      caminho: "/api/v1/sessions",
      token: null,
      corpo: null,
    });
  });

  it("qualquer resposta HTTP indica servidor encontrado", async () => {
    for (const status of [405, 404, 200, 500]) {
      const { operacoes } = operacoesCom(status, "");
      const resultado = await operacoes.verificarServidor();
      expect(resultado.ok).toBe(true);
      expect(resultado.ok && resultado.dados.status).toBe(status);
      expect(resultado.ok && resultado.dados.duracaoMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("cada erro de rede vira falha com a mensagem correspondente", async () => {
    const esperadas: Array<[ErroRede, string]> = [
      [
        "conexao_recusada",
        "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução.",
      ],
      ["tempo_esgotado", "O servidor não respondeu a tempo. Verifique a conexão e tente novamente."],
      ["endereco_nao_encontrado", "Endereço do servidor não encontrado. Verifique o IP informado."],
      ["resposta_muito_grande", "A resposta do servidor é grande demais para ser processada."],
      ["falha_rede", "Falha de rede ao comunicar com o servidor."],
    ];
    for (const [erro, mensagem] of esperadas) {
      const falso = criarIntermediarioFalso(() => respostaJson(resultadoErroRede(erro)));
      const operacoes = criarOperacoes(
        criarClienteHttp({ obterConexao: () => conexao, buscar: falso.buscar }),
      );
      expect(await operacoes.verificarServidor()).toEqual({
        ok: false,
        tipo: "rede",
        status: null,
        mensagem,
      });
    }
  });

  it("repassa falhas de intermediário e de conexão", async () => {
    const semConexao = criarOperacoes(criarClienteHttp({ obterConexao: () => null }));
    expect(await semConexao.verificarServidor()).toMatchObject({ ok: false, tipo: "conexao" });
    const foraDoAr = criarOperacoes(
      criarClienteHttp({
        obterConexao: () => conexao,
        buscar: () => Promise.reject(new TypeError("Failed to fetch")),
      }),
    );
    expect(await foraDoAr.verificarServidor()).toMatchObject({ ok: false, tipo: "intermediario" });
  });
});
