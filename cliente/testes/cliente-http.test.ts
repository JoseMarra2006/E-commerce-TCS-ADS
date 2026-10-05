import { describe, expect, it } from "vitest";
import { criarClienteHttp } from "../src/api/cliente-http.ts";
import type { RegistroMensagem } from "../src/api/cliente-http.ts";
import type { ErroRede } from "../src/tipos/intermediario.ts";
import {
  criarIntermediarioFalso,
  respostaJson,
  resultadoErroRede,
  resultadoResposta,
} from "./auxiliares-api.ts";

const conexao = { ip: "10.20.50.123", porta: 20000 };

function criar(
  aoEnviar: Parameters<typeof criarIntermediarioFalso>[0],
  extra: { aoRegistrar?: (registro: RegistroMensagem) => void; tempoLimiteMs?: number } = {},
) {
  const falso = criarIntermediarioFalso(aoEnviar);
  const cliente = criarClienteHttp({
    obterConexao: () => conexao,
    buscar: falso.buscar,
    ...extra,
  });
  return { falso, cliente };
}

const respostaPadrao = () => respostaJson(resultadoResposta(200, "{}"));

describe("cliente HTTP", () => {
  it("sem conexão devolve tipo conexao e não chama o intermediário", async () => {
    const falso = criarIntermediarioFalso(respostaPadrao);
    const cliente = criarClienteHttp({ obterConexao: () => null, buscar: falso.buscar });
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    expect(resultado).toEqual({
      ok: false,
      tipo: "conexao",
      status: null,
      mensagem: "Configure o IP e a porta do servidor antes de continuar.",
      corpoTexto: null,
    });
    expect(falso.chamadas).toHaveLength(0);
  });

  it("obtém o token do intermediário uma única vez", async () => {
    const { falso, cliente } = criar(respostaPadrao);
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    expect(falso.tokensEmitidos()).toBe(1);
  });

  it("monta o pedido com todos os campos e os cabeçalhos do intermediário", async () => {
    const { falso, cliente } = criar(respostaPadrao);
    await cliente.enviar({
      metodo: "POST",
      caminho: "/api/v1/users",
      token: "jwt.aqui",
      corpo: { nome: "Ana", email: "a@b.com", senha: "abc123" },
    });
    expect(falso.pedidosEnviados()[0]).toEqual({
      ip: "10.20.50.123",
      porta: 20000,
      metodo: "POST",
      caminho: "/api/v1/users",
      token: "jwt.aqui",
      corpo: '{"nome":"Ana","email":"a@b.com","senha":"abc123"}',
    });
    const envio = falso.chamadas[1];
    expect(envio?.url).toBe("/intermediario/enviar");
    expect(envio?.metodo).toBe("POST");
    expect(envio?.cabecalhos["content-type"]).toBe("application/json");
    expect(envio?.cabecalhos["x-token-intermediario"]).toBe("token-intermediario-1");
  });

  it("sem token e sem corpo envia null nos dois campos", async () => {
    const { falso, cliente } = criar(respostaPadrao);
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    expect(falso.pedidosEnviados()[0]).toMatchObject({ token: null, corpo: null });
  });

  it("403 do intermediário obtém novo token e tenta uma única vez", async () => {
    let tentativas = 0;
    const { falso, cliente } = criar(() => {
      tentativas += 1;
      return tentativas === 1 ? respostaJson({ mensagem: "Acesso negado." }, 403) : respostaPadrao();
    });
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    expect(resultado.ok).toBe(true);
    expect(tentativas).toBe(2);
    expect(falso.tokensEmitidos()).toBe(2);
    expect(falso.chamadas[3]?.cabecalhos["x-token-intermediario"]).toBe("token-intermediario-2");
  });

  it("403 repetido devolve tipo intermediario", async () => {
    let tentativas = 0;
    const { cliente } = criar(() => {
      tentativas += 1;
      return respostaJson({ mensagem: "Acesso negado." }, 403);
    });
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.tipo).toBe("intermediario");
    expect(tentativas).toBe(2);
  });

  it("cada erro de rede gera a mensagem correspondente", async () => {
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
      const { cliente } = criar(() => respostaJson(resultadoErroRede(erro)));
      const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/users/1" });
      expect(resultado).toEqual({
        ok: false,
        tipo: "rede",
        status: null,
        mensagem,
        corpoTexto: null,
      });
    }
  });

  it("status 200, 201 e 204 são sucesso", async () => {
    for (const status of [200, 201, 204]) {
      const { cliente } = criar(() => respostaJson(resultadoResposta(status, "")));
      const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
      expect(resultado.ok).toBe(true);
      expect(resultado.ok && resultado.status).toBe(status);
    }
  });

  it("usa a mensagem do servidor e corta mensagens acima de 300 caracteres", async () => {
    const { cliente } = criar(() =>
      respostaJson(resultadoResposta(409, '{"mensagem":"E-mail já cadastrado."}'))
    );
    const curto = await cliente.enviar({ metodo: "POST", caminho: "/api/v1/users" });
    expect(curto).toMatchObject({
      ok: false,
      tipo: "http",
      status: 409,
      mensagem: "E-mail já cadastrado.",
    });

    const longa = "x".repeat(400);
    const { cliente: outro } = criar(() =>
      respostaJson(resultadoResposta(400, JSON.stringify({ mensagem: longa })))
    );
    const cortado = await outro.enviar({ metodo: "POST", caminho: "/api/v1/users" });
    expect(!cortado.ok && cortado.mensagem).toBe(`${"x".repeat(300)}...`);
  });

  it("usa a mensagem padrão do status quando o corpo não ajuda", async () => {
    const padroes: Record<number, string> = {
      400: "Os dados enviados foram recusados pelo servidor.",
      401: "Não autorizado. Faça login novamente.",
      403: "Você não tem permissão para realizar esta operação.",
      404: "Recurso não encontrado no servidor.",
      405: "O servidor não aceita esta operação nesta rota.",
      409: "Os dados informados entram em conflito com um cadastro existente.",
      500: "Erro interno no servidor.",
      418: "O servidor respondeu com um erro inesperado (código 418).",
    };
    const corpos = ["", "<html>erro</html>", '{"outro":1}', '{"mensagem":123}', '{"mensagem":"  "}'];
    for (const [status, mensagem] of Object.entries(padroes)) {
      for (const corpo of corpos) {
        const { cliente } = criar(() => respostaJson(resultadoResposta(Number(status), corpo)));
        const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
        expect(!resultado.ok && resultado.mensagem).toBe(mensagem);
      }
    }
  });

  it("resultado do intermediário com formato inválido devolve tipo intermediario", async () => {
    const invalidos: unknown[] = [
      null,
      "texto",
      { tipo: "resposta" },
      { tipo: "resposta", url: "u", status: "200", cabecalhos: {}, corpo: "", duracaoMs: 1 },
      { tipo: "resposta", url: "u", status: 200, cabecalhos: { a: 1 }, corpo: "", duracaoMs: 1 },
      { tipo: "erro_rede", url: "u", erro: "desconhecido", duracaoMs: 1 },
      { tipo: "outro", url: "u", duracaoMs: 1 },
    ];
    for (const corpo of invalidos) {
      const { cliente } = criar(() => respostaJson(corpo));
      const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
      expect(!resultado.ok && resultado.tipo).toBe("intermediario");
    }
  });

  it("status diferente de 200 do intermediário devolve tipo intermediario", async () => {
    const { cliente } = criar(() => respostaJson({ mensagem: "erro" }, 500));
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
    expect(!resultado.ok && resultado.tipo).toBe("intermediario");
  });

  it("intermediário fora do ar devolve a mensagem de intermediário parado", async () => {
    const cliente = criarClienteHttp({
      obterConexao: () => conexao,
      buscar: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
    expect(resultado).toEqual({
      ok: false,
      tipo: "intermediario",
      status: null,
      mensagem: "O intermediário do cliente não está em execução. Feche e abra o cliente novamente.",
      corpoTexto: null,
    });
  });

  it("intermediário que nunca responde esgota o tempo limite", async () => {
    const cliente = criarClienteHttp({
      obterConexao: () => conexao,
      buscar: () => new Promise<Response>(() => {}),
      tempoLimiteMs: 50,
    });
    const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
    expect(!resultado.ok && resultado.tipo).toBe("intermediario");
  });

  it("registra cada envio uma vez, mascarando dados sensíveis", async () => {
    const registros: RegistroMensagem[] = [];
    const tokenJwt = "eyJhbGciOiJIUzI1NiJ9.corpo.assinatura";
    const { cliente } = criar(
      () =>
        respostaJson(
          resultadoResposta(
            201,
            JSON.stringify({ id: "s1", token: tokenJwt, usuario: { id: 1 } }),
            "http://10.20.50.123:20000/api/v1/sessions",
          ),
        ),
      { aoRegistrar: (registro) => registros.push(registro) },
    );
    await cliente.enviar({
      metodo: "POST",
      caminho: "/api/v1/sessions",
      token: "TOKEN-DE-AUTORIZACAO-COMPLETO",
      corpo: { email: "a@b.com", senha: "abc123" },
    });
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/sessions" });

    expect(registros).toHaveLength(2);
    const [primeiro, segundo] = registros;
    expect(primeiro?.id).toBe(1);
    expect(segundo?.id).toBe(2);
    expect(primeiro?.url).toBe("http://10.20.50.123:20000/api/v1/sessions");
    expect(primeiro?.metodo).toBe("POST");
    expect(primeiro?.autenticado).toBe(true);
    expect(segundo?.autenticado).toBe(false);
    expect(primeiro?.corpoEnviado).toBe('{"email":"a@b.com","senha":"***"}');
    expect(primeiro?.corpoRecebido).toContain('"token":"eyJhbGci..."');
    expect(primeiro?.status).toBe(201);
    expect(primeiro?.erro).toBeNull();
    expect(new Date(primeiro?.horario ?? "").toISOString()).toBe(primeiro?.horario);
    const texto = JSON.stringify(registros);
    expect(texto).not.toContain("TOKEN-DE-AUTORIZACAO-COMPLETO");
    expect(texto).not.toContain("abc123");
    expect(texto).not.toContain(tokenJwt);
  });

  it("registra erros sem resposta HTTP e ignora exceção em aoRegistrar", async () => {
    const registros: RegistroMensagem[] = [];
    const { cliente } = criar(() => respostaJson(resultadoErroRede("conexao_recusada")), {
      aoRegistrar: (registro) => registros.push(registro),
    });
    await cliente.enviar({ metodo: "GET", caminho: "/api/v1/x" });
    expect(registros[0]?.status).toBeNull();
    expect(registros[0]?.erro).toContain("Não foi possível conectar");

    const { cliente: comFalha } = criar(respostaPadrao, {
      aoRegistrar: () => {
        throw new Error("falha no registro");
      },
    });
    const resultado = await comFalha.enviar({ metodo: "GET", caminho: "/api/v1/x" });
    expect(resultado.ok).toBe(true);
  });

  it("nunca lança exceção", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const { cliente } = criar(respostaPadrao);
    await expect(
      cliente.enviar({ metodo: "POST", caminho: "/api/v1/x", corpo: circular }),
    ).resolves.toMatchObject({ ok: false, tipo: "intermediario" });
    const semBuscar = criarClienteHttp({
      obterConexao: () => {
        throw new Error("falha");
      },
    });
    await expect(semBuscar.enviar({ metodo: "GET", caminho: "/api/v1/x" })).resolves.toMatchObject({
      ok: false,
    });
  });
});
