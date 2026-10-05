import { describe, expect, it } from "vitest";
import {
  validarEmail,
  validarFormularioCadastro,
  validarFormularioConexao,
  validarFormularioEdicao,
  validarFormularioLogin,
  validarIp,
  validarNome,
  validarPorta,
  validarSenha,
} from "../src/validacao/validacao-campos.ts";

const MENSAGEM_EMAIL_TAMANHO = "O campo email deve ter entre 5 e 30 caracteres.";
const MENSAGEM_EMAIL_PADRAO =
  'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).';
const MENSAGEM_SENHA_TAMANHO = "O campo senha deve ter entre 6 e 20 caracteres.";
const MENSAGEM_SENHA_PADRAO =
  "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.";
const MENSAGEM_NOME =
  "O campo nome deve ter entre 3 e 50 caracteres, sem contar espaços no início e no fim.";

const atuais = { id: 7, nome: "Maria Silva", email: "maria@exemplo.com" };

describe("validarEmail", () => {
  it("aceita e-mails válidos nos limites", () => {
    expect(validarEmail("a@b.c")).toEqual({ ok: true, valor: "a@b.c" });
    expect(validarEmail("a".repeat(18) + "@exemplo.com")).toEqual({
      ok: true,
      valor: "a".repeat(18) + "@exemplo.com",
    });
  });

  it("recusa tamanho fora do limite antes de verificar o padrão", () => {
    expect(validarEmail("a@b.")).toEqual({ ok: false, mensagem: MENSAGEM_EMAIL_TAMANHO });
    expect(validarEmail("a".repeat(31))).toEqual({ ok: false, mensagem: MENSAGEM_EMAIL_TAMANHO });
    expect(validarEmail("")).toEqual({ ok: false, mensagem: MENSAGEM_EMAIL_TAMANHO });
  });

  it("recusa padrão inválido", () => {
    for (const valor of ["semarroba.com", "ab@cd", "a b@c.com", "a@@b.com", "@b.com1", "a@.com"]) {
      expect(validarEmail(valor)).toEqual({ ok: false, mensagem: MENSAGEM_EMAIL_PADRAO });
    }
  });

  it("não aplica trim", () => {
    expect(validarEmail(" a@b.com")).toEqual({ ok: false, mensagem: MENSAGEM_EMAIL_PADRAO });
  });
});

describe("validarSenha", () => {
  it("aceita senhas alfanuméricas nos limites", () => {
    expect(validarSenha("abc123")).toEqual({ ok: true, valor: "abc123" });
    expect(validarSenha("A".repeat(20))).toEqual({ ok: true, valor: "A".repeat(20) });
  });

  it("recusa tamanho fora do limite", () => {
    expect(validarSenha("abc12")).toEqual({ ok: false, mensagem: MENSAGEM_SENHA_TAMANHO });
    expect(validarSenha("a".repeat(21))).toEqual({ ok: false, mensagem: MENSAGEM_SENHA_TAMANHO });
  });

  it("recusa caracteres especiais, espaços e acentos", () => {
    for (const valor of ["abc 1234", "abc123!", "senhaé123", "abc_1234"]) {
      expect(validarSenha(valor)).toEqual({ ok: false, mensagem: MENSAGEM_SENHA_PADRAO });
    }
  });

  it("conta caracteres e não unidades de código", () => {
    expect(validarSenha("😀😀😀😀😀")).toEqual({ ok: false, mensagem: MENSAGEM_SENHA_TAMANHO });
    expect(validarSenha("😀😀😀😀😀😀")).toEqual({ ok: false, mensagem: MENSAGEM_SENHA_PADRAO });
  });
});

describe("validarNome", () => {
  it("aplica trim e aceita os limites", () => {
    expect(validarNome("  Ana  ")).toEqual({ ok: true, valor: "Ana" });
    expect(validarNome("a".repeat(50))).toEqual({ ok: true, valor: "a".repeat(50) });
  });

  it("recusa nomes curtos ou longos após o trim", () => {
    expect(validarNome("  Al  ")).toEqual({ ok: false, mensagem: MENSAGEM_NOME });
    expect(validarNome("")).toEqual({ ok: false, mensagem: MENSAGEM_NOME });
    expect(validarNome("a".repeat(51))).toEqual({ ok: false, mensagem: MENSAGEM_NOME });
  });

  it("conta caracteres com Array.from", () => {
    expect(validarNome("😀".repeat(50)).ok).toBe(true);
    expect(validarNome("😀".repeat(51)).ok).toBe(false);
  });
});

describe("validarIp", () => {
  it("aceita IPv4, nomes de host e aplica trim", () => {
    for (const valor of ["10.20.50.123", "127.0.0.1", "localhost", "pc-do-colega.local"]) {
      expect(validarIp(valor)).toEqual({ ok: true, valor });
    }
    expect(validarIp(" 10.20.50.123 ")).toEqual({ ok: true, valor: "10.20.50.123" });
  });

  it("recusa vazio com mensagem própria", () => {
    expect(validarIp("")).toEqual({ ok: false, mensagem: "Informe o IP do servidor." });
    expect(validarIp("   ")).toEqual({ ok: false, mensagem: "Informe o IP do servidor." });
  });

  it("recusa valores inválidos", () => {
    const mensagem =
      "Informe um IP válido (ex.: 10.20.50.123) ou um nome de host (ex.: localhost).";
    for (
      const valor of [
        "256.1.1.1",
        "10.20.50",
        "http://10.20.50.123",
        "10.20.50.123:20000",
        "a b",
      ]
    ) {
      expect(validarIp(valor)).toEqual({ ok: false, mensagem });
    }
  });
});

describe("validarPorta", () => {
  it("aceita portas válidas e aplica trim", () => {
    expect(validarPorta("20000")).toEqual({ ok: true, valor: 20000 });
    expect(validarPorta("1")).toEqual({ ok: true, valor: 1 });
    expect(validarPorta("65535")).toEqual({ ok: true, valor: 65535 });
    expect(validarPorta(" 20000 ")).toEqual({ ok: true, valor: 20000 });
  });

  it("recusa vazio, não numérico e fora do intervalo", () => {
    expect(validarPorta("")).toEqual({ ok: false, mensagem: "Informe a porta do servidor." });
    for (const valor of ["abc", "20.000", "-1"]) {
      expect(validarPorta(valor)).toEqual({
        ok: false,
        mensagem: "A porta deve conter apenas números.",
      });
    }
    for (const valor of ["0", "65536", "99999999999999999999"]) {
      expect(validarPorta(valor)).toEqual({
        ok: false,
        mensagem: "A porta deve estar entre 1 e 65535.",
      });
    }
  });
});

describe("formulários", () => {
  it("cadastro retorna todos os erros de uma vez", () => {
    const resultado = validarFormularioCadastro({ nome: "A", email: "x", senha: "1" });
    expect(resultado).toEqual({
      ok: false,
      erros: { nome: MENSAGEM_NOME, email: MENSAGEM_EMAIL_TAMANHO, senha: MENSAGEM_SENHA_TAMANHO },
    });
  });

  it("cadastro retorna dados normalizados", () => {
    expect(validarFormularioCadastro({ nome: "  Ana Lima ", email: "a@b.com", senha: "abc123" }))
      .toEqual({ ok: true, dados: { nome: "Ana Lima", email: "a@b.com", senha: "abc123" } });
  });

  it("login retorna erros por campo e dados válidos", () => {
    expect(validarFormularioLogin({ email: "x", senha: "1" })).toEqual({
      ok: false,
      erros: { email: MENSAGEM_EMAIL_TAMANHO, senha: MENSAGEM_SENHA_TAMANHO },
    });
    expect(validarFormularioLogin({ email: "a@b.com", senha: "abc123" })).toEqual({
      ok: true,
      dados: { email: "a@b.com", senha: "abc123" },
    });
  });

  it("conexão retorna erros por campo e dados normalizados", () => {
    expect(validarFormularioConexao({ ip: "", porta: "abc" })).toEqual({
      ok: false,
      erros: {
        ip: "Informe o IP do servidor.",
        porta: "A porta deve conter apenas números.",
      },
    });
    expect(validarFormularioConexao({ ip: " localhost ", porta: " 20000 " })).toEqual({
      ok: true,
      dados: { ip: "localhost", porta: 20000 },
    });
  });
});

describe("validarFormularioEdicao", () => {
  const base = { nome: atuais.nome, email: atuais.email, senha: "" };

  it("inclui só o nome quando só ele foi alterado", () => {
    expect(validarFormularioEdicao({ ...base, nome: "  Maria Souza " }, atuais)).toEqual({
      ok: true,
      dados: { nome: "Maria Souza" },
    });
  });

  it("nome igual ao atual com espaços nas pontas não conta como alteração", () => {
    expect(validarFormularioEdicao({ ...base, nome: "  Maria Silva  " }, atuais)).toEqual({
      ok: false,
      nadaAlterado: true,
    });
  });

  it("senha vazia não é incluída e nada alterado é informado", () => {
    expect(validarFormularioEdicao(base, atuais)).toEqual({ ok: false, nadaAlterado: true });
  });

  it("inclui a senha quando preenchida e a valida", () => {
    expect(validarFormularioEdicao({ ...base, senha: "nova123" }, atuais)).toEqual({
      ok: true,
      dados: { senha: "nova123" },
    });
    expect(validarFormularioEdicao({ ...base, senha: "1" }, atuais)).toEqual({
      ok: false,
      erros: { senha: MENSAGEM_SENHA_TAMANHO },
    });
  });

  it("e-mail alterado e inválido gera erro só no e-mail", () => {
    expect(validarFormularioEdicao({ ...base, email: "invalido" }, atuais)).toEqual({
      ok: false,
      erros: { email: MENSAGEM_EMAIL_PADRAO },
    });
  });

  it("e-mail é comparado exatamente, diferenciando maiúsculas", () => {
    expect(validarFormularioEdicao({ ...base, email: "Maria@exemplo.com" }, atuais)).toEqual({
      ok: true,
      dados: { email: "Maria@exemplo.com" },
    });
  });

  it("combina vários campos alterados", () => {
    expect(
      validarFormularioEdicao(
        { nome: "Novo Nome", email: "novo@exemplo.com", senha: "abc123" },
        atuais,
      ),
    ).toEqual({
      ok: true,
      dados: { nome: "Novo Nome", email: "novo@exemplo.com", senha: "abc123" },
    });
  });
});
