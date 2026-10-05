import { describe, expect, it } from "vitest";
import {
  classificarStatus,
  descreverStatus,
  extrairCaminho,
  extrairServidor,
  formatarCorpo,
  formatarHorario,
} from "../src/componentes/painel-mensagens/exibicao.ts";

describe("classificarStatus", () => {
  it.each([
    [200, "sucesso"],
    [204, "sucesso"],
    [299, "sucesso"],
    [300, "redirecionamento"],
    [302, "redirecionamento"],
    [400, "erro_cliente"],
    [401, "erro_cliente"],
    [409, "erro_cliente"],
    [499, "erro_cliente"],
    [500, "erro_servidor"],
    [503, "erro_servidor"],
    [599, "erro_servidor"],
    [600, "falha"],
    [0, "falha"],
    [-1, "falha"],
    [null, "falha"],
  ] as const)("classifica %s como %s", (status, esperado) => {
    expect(classificarStatus(status)).toBe(esperado);
  });
});

describe("descreverStatus", () => {
  it.each([
    [200, "200 OK"],
    [201, "201 Created"],
    [204, "204 No Content"],
    [301, "301 Moved Permanently"],
    [302, "302 Found"],
    [304, "304 Not Modified"],
    [400, "400 Bad Request"],
    [401, "401 Unauthorized"],
    [403, "403 Forbidden"],
    [404, "404 Not Found"],
    [405, "405 Method Not Allowed"],
    [409, "409 Conflict"],
    [422, "422 Unprocessable Entity"],
    [500, "500 Internal Server Error"],
    [502, "502 Bad Gateway"],
    [503, "503 Service Unavailable"],
    [504, "504 Gateway Timeout"],
    [418, "418"],
    [null, "Sem resposta"],
  ] as const)("descreve %s como %s", (status, esperado) => {
    expect(descreverStatus(status)).toBe(esperado);
  });
});

describe("extrairCaminho e extrairServidor", () => {
  it("extrai de URL com IP e porta", () => {
    const url = "http://10.20.50.123:20000/api/v1/users/5";
    expect(extrairCaminho(url)).toBe("/api/v1/users/5");
    expect(extrairServidor(url)).toBe("10.20.50.123:20000");
  });

  it("extrai de URL com localhost", () => {
    const url = "http://localhost:3000/api/v1/sessions";
    expect(extrairCaminho(url)).toBe("/api/v1/sessions");
    expect(extrairServidor(url)).toBe("localhost:3000");
  });

  it("preserva a barra final", () => {
    expect(extrairCaminho("http://localhost:3000/api/v1/users/")).toBe("/api/v1/users/");
  });

  it("trata URL inválida", () => {
    expect(extrairCaminho("isto não é url")).toBe("isto não é url");
    expect(extrairServidor("isto não é url")).toBe("");
  });
});

describe("formatarCorpo", () => {
  it("retorna null para null e texto vazio", () => {
    expect(formatarCorpo(null)).toBeNull();
    expect(formatarCorpo("")).toBeNull();
  });

  it("reformata objeto JSON com recuo de 2 espaços", () => {
    expect(formatarCorpo('{"a":1,"b":"x"}')).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it("reformata array JSON", () => {
    expect(formatarCorpo("[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it("mantém texto que não é JSON", () => {
    expect(formatarCorpo("erro simples")).toBe("erro simples");
  });

  it("não lança exceção com aninhamento muito profundo", () => {
    const texto = "[".repeat(5000) + "]".repeat(5000);
    expect(() => formatarCorpo(texto)).not.toThrow();
    expect(typeof formatarCorpo(texto)).toBe("string");
  });

  it("preserva a senha já mascarada", () => {
    const resultado = formatarCorpo('{"email":"a@b.co","senha":"***"}');
    expect(resultado).toContain('"senha": "***"');
  });
});

describe("formatarHorario", () => {
  it("formata como HH:MM:SS", () => {
    expect(formatarHorario(new Date(2026, 0, 2, 3, 4, 5).toISOString())).toBe("03:04:05");
  });

  it("trata horário inválido", () => {
    expect(formatarHorario("xyz")).toBe("--:--:--");
  });
});
